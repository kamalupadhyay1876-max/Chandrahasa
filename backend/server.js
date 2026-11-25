'use strict';
/* ═══════════════════════════════════════════════════════════════
   CHANDRAHASA — Production HTTP server
   Node built-ins + better-sqlite3 only. No framework magic.
   · Static file serving with traversal protection
   · REST API (products, cart, orders, auth, admin, coupons…)
   · scrypt password hashing · httpOnly session cookies
   · HMAC-SHA256 payment signature verification (Razorpay-compatible)
   · Rate limiting on auth routes · deny-by-default admin RBAC
   ═══════════════════════════════════════════════════════════════ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// Load local .env without a runtime dependency; platform environment always wins.
(function loadLocalEnv(){
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim(); if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if (!match) continue;
    let value = match[2].trim(); if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
})();

const db = require('./db');
const { createBackup } = require('./scripts/backup');



const PORT = parseInt(process.env.PORT || '3000', 10);
const SECRET = process.env.SECRET || 'chandrahasa-dev-secret-change-me';
// The combined Docker image copies frontend/ to backend/public. For direct
// source runs, serve the sibling frontend package instead of failing because
// backend/public has not been materialized yet.
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '../frontend');
const isProd = process.env.NODE_ENV === 'production';

if (isProd && (SECRET.length < 32 || /change-me|demo/i.test(SECRET))) {
  throw new Error('Set a unique SECRET of at least 32 characters before running in production.');
}

/* ────────────────────────── helpers ────────────────────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, headers) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'no-store',
    ...headers,
  };
  res.writeHead(status, h);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
const json = (res, status, data, headers) => send(res, status, data, headers);

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      const maxBody = String(req.url || '').startsWith('/api/admin/media') ? 11_500_000 : 1_000_000;
      if (size > maxBody) { req.bodyTooLarge = true; data = ''; return; } // bounded JSON payload; media upload has a separate 11.5 MB ceiling
      data += chunk;
    });
    req.on('end', () => {
      req.rawBody = data;
      if (req.bodyTooLarge) return resolve({ __payloadTooLarge: true });
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) {
      const key = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();
      try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
    }
  }
  return out;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac256 = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('hex');
const scrypt = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha256(token), userId, expires);
  return { token, expires };
}
function sessionCookie(token, expires) {
  return `ch_session=${token}; HttpOnly; Path=/; SameSite=Lax; Expires=${new Date(expires).toUTCString()}${isProd ? '; Secure' : ''}`;
}
function clearSessionCookie() { return 'ch_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'; }

function csrfCookie(token) {
  return `ch_csrf=${token}; Path=/; SameSite=Strict; Max-Age=7200${isProd ? '; Secure' : ''}`;
}
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function issueCsrf(req, res) {
  const current = parseCookies(req).ch_csrf;
  const token = current && /^[a-f0-9]{64}$/.test(current) ? current : crypto.randomBytes(32).toString('hex');
  return json(res, 200, { token }, { 'Set-Cookie': csrfCookie(token), 'Cache-Control': 'no-store' });
}

function getUser(req) {
  const { ch_session } = parseCookies(req);
  if (!ch_session) return null;
  const row = db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.role FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > datetime('now')`).get(sha256(ch_session));
  return row || null;
}

/* Rate limiting — sliding window in memory (auth: 10 req / 10 min / IP) */
const buckets = new Map();
function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) { buckets.set(key, arr); return true; }
  arr.push(now); buckets.set(key, arr);
  return false;
}
setInterval(() => { const now = Date.now(); for (const [k, arr] of buckets) { const kept = arr.filter(t => now - t < 600000); if (kept.length) buckets.set(k, kept); else buckets.delete(k); } }, 600000).unref();

const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
const validEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const clean = (s, max = 300) => String(s ?? '').replace(/[<>"'`]/g, '').trim().slice(0, max);

// Normalize legacy/test category slugs for the public storefront without rewriting
// owner-managed category or product rows in the database.
function storefrontCategory(name, slug) {
  const key = `${String(name || '')} ${String(slug || '')}`.toLowerCase();
  if (/(demo|test|sample)/.test(key)) return null;
  if (/(?:^|[^a-z])rings?(?:$|[^a-z])|ring(?:my|[0-9])/.test(key)) return { name: 'Rings', slug: 'rings' };
  if (/necklace/.test(key)) return { name: 'Necklaces', slug: 'necklaces' };
  if (/earring/.test(key)) return { name: 'Earrings', slug: 'earrings' };
  if (/pendant/.test(key)) return { name: 'Pendants', slug: 'pendants' };
  if (/bracelet|bangle/.test(key)) return { name: 'Bracelets', slug: 'bracelets' };
  if (/gift/.test(key)) return { name: 'Gift Sets', slug: 'gift-sets' };
  return { name: clean(name || slug, 80), slug: clean(slug || name, 80).toLowerCase() };
}
const toInt = (v, dflt = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : dflt; };

const ORDER_TRANSITIONS = Object.freeze({
  pending: new Set(['confirmed','cancelled']),
  confirmed: new Set(['shipped','cancelled']),
  shipped: new Set(['out_for_delivery','delivered','returned']),
  out_for_delivery: new Set(['delivered','returned']),
  delivered: new Set(['returned']),
  cancelled: new Set(), returned: new Set()
});
function validateOrderTransition(order,nextStatus){
  if(!order)return 'Order not found.';
  if(order.status===nextStatus)return '';
  if(!ORDER_TRANSITIONS[order.status]?.has(nextStatus))return `Invalid order transition: ${order.status} → ${nextStatus}.`;
  if(['shipped','out_for_delivery','delivered'].includes(nextStatus) && order.payment_method!=='cod' && order.payment_status!=='paid')return 'Online payment must be captured before fulfilment.';
  if(nextStatus==='cancelled' && order.payment_status==='paid')return 'A captured online payment must be refunded before cancellation. Use the return/refund workflow.';
  if(nextStatus==='returned'&&!db.prepare("SELECT id FROM return_requests WHERE order_id=? AND status IN ('approved','received','refunded') LIMIT 1").get(order.id))return 'An approved customer return request is required before marking this order returned.';
  return '';
}
const money = (n) => Math.round(n);
async function createEmbedding(input){if(!process.env.OPENAI_API_KEY)return null;const r=await fetch(process.env.EMBEDDINGS_API_URL||'https://api.openai.com/v1/embeddings',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.EMBEDDINGS_MODEL||'text-embedding-3-small',input:String(input).slice(0,6000)}),signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok||!Array.isArray(d.data?.[0]?.embedding))throw new Error('Embedding provider request failed');return d.data[0].embedding;}
function cosineSimilarity(a,b){let dot=0,aa=0,bb=0;for(let i=0;i<Math.min(a.length,b.length);i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/(Math.sqrt(aa)*Math.sqrt(bb)):0;}

// Durable notification event outbox. Delivery is opt-in through an HTTPS
// automation endpoint (for example, a private n8n webhook); this is not an
// email/SMS provider and never silently pretends that a message was delivered.
function enqueueNotification(eventType, aggregateId, payload) {
  db.prepare('INSERT OR IGNORE INTO notification_outbox(event_type,aggregate_id,payload) VALUES(?,?,?)')
    .run(clean(eventType,80), String(aggregateId).slice(0,160), JSON.stringify(payload||{}));
}
async function dispatchNotificationOutbox() {
  const endpoint=String(process.env.NOTIFICATION_WEBHOOK_URL||'').trim();
  const secret=String(process.env.NOTIFICATION_WEBHOOK_SECRET||'');
  if(!endpoint) return {skipped:true,reason:'NOTIFICATION_WEBHOOK_URL is not configured'};
  let parsed; try { parsed=new URL(endpoint); } catch { throw new Error('NOTIFICATION_WEBHOOK_URL must be a valid HTTPS URL'); }
  if(parsed.protocol!=='https:') throw new Error('NOTIFICATION_WEBHOOK_URL must use HTTPS');
  if(secret.length<32) throw new Error('NOTIFICATION_WEBHOOK_SECRET must contain at least 32 characters');
  const now=db.prepare("SELECT datetime('now') now").get().now;
  const row=db.prepare("SELECT * FROM notification_outbox WHERE (status IN ('pending','failed') AND next_attempt_at<=datetime('now')) OR (status='processing' AND locked_at<datetime('now','-5 minutes')) ORDER BY id LIMIT 1").get();
  if(!row) return {empty:true};
  const claimed=db.prepare("UPDATE notification_outbox SET status='processing',locked_at=datetime('now'),attempts=attempts+1,last_error='' WHERE id=? AND ((status IN ('pending','failed') AND next_attempt_at<=datetime('now')) OR (status='processing' AND locked_at<datetime('now','-5 minutes')))").run(row.id);
  if(!claimed.changes) return {busy:true};
  const body=JSON.stringify({id:row.id,event:row.event_type,aggregateId:row.aggregate_id,occurredAt:row.created_at,data:JSON.parse(row.payload||'{}')});
  const signature=crypto.createHmac('sha256',secret).update(body).digest('hex');
  try {
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Chandrahasa-Signature':signature,'X-Chandrahasa-Event':row.event_type},body,signal:AbortSignal.timeout(10000)});
    const responseText=(await response.text()).slice(0,2000);
    if(!response.ok) throw new Error(`Notification endpoint returned HTTP ${response.status}: ${responseText}`);
    db.prepare("UPDATE notification_outbox SET status='sent',sent_at=datetime('now'),locked_at='',provider_response=? WHERE id=?").run(responseText,row.id);
    return {sent:true,id:row.id};
  } catch(err) {
    const attempts=Number(row.attempts||0)+1,dead=attempts>=8,delay=Math.min(3600,15*Math.pow(2,Math.min(attempts-1,8)));
    db.prepare("UPDATE notification_outbox SET status=?,locked_at='',last_error=?,next_attempt_at=datetime('now',?) WHERE id=?").run(dead?'dead':'failed',clean(err?.message||'Delivery failed',1000),`+${delay} seconds`,row.id);
    return {sent:false,id:row.id,dead,error:clean(err?.message||'Delivery failed',300)};
  }
}

const productRow = (p) => ({
  ...p,
  images: JSON.parse(p.images || '[]'),
  compare_price: p.compare_price ?? null,
  badge: p.badge ?? null,
  is_active: !!p.is_active,
});

// Hide obvious seed/demo catalogue records from customer-facing discovery; keep owner data intact.
const PUBLIC_CATALOG_FILTER = "(lower(name) NOT LIKE 'demo%' AND lower(name) NOT LIKE 'test%' AND lower(name) NOT LIKE 'sample%' AND lower(name) <> 'hii')";

function auditLog(userId, action, entity, entityId, details = {}) {
  try { db.prepare('INSERT INTO admin_audit_log (user_id, action, entity, entity_id, details) VALUES (?,?,?,?,?)')
    .run(userId || null, action, entity, String(entityId ?? ''), JSON.stringify(details)); } catch {}
}


function validSellerImagePath(image){if(!image)return true;if(!/^\/assets\/[a-zA-Z0-9_./-]+\.(jpg|jpeg|png|webp|avif)$/i.test(image)||image.split('/').includes('..'))return false;const base=path.resolve(__dirname,'../frontend/assets'),target=path.resolve(__dirname,'../frontend',image.slice(1));return target.startsWith(base+path.sep)&&fs.existsSync(target)&&fs.statSync(target).isFile();}
function syncSellerWarehouseStock(sellerId,productId,quantity,actorUserId=null){const wh=db.prepare('SELECT id FROM seller_warehouses WHERE seller_id=? AND is_default=1 AND active=1 ORDER BY id LIMIT 1').get(sellerId);if(!wh)return;const prior=db.prepare('SELECT quantity,reserved FROM warehouse_inventory WHERE warehouse_id=? AND product_id=?').get(wh.id,productId);const next=Math.max(Number(quantity)||0,Number(prior?.reserved)||0),delta=next-Number(prior?.quantity||0);db.prepare('INSERT INTO warehouse_inventory(warehouse_id,product_id,quantity,reserved) VALUES(?,?,?,0) ON CONFLICT(warehouse_id,product_id) DO UPDATE SET quantity=MAX(excluded.quantity,warehouse_inventory.reserved),updated_at=datetime(\'now\')').run(wh.id,productId,next);if(delta)db.prepare("INSERT INTO inventory_movements(warehouse_id,product_id,delta,reason,reference,actor_user_id) VALUES(?,?,?,'seller_catalog_stock_sync','bulk-or-listing',?)").run(wh.id,productId,delta,actorUserId);}
function parseCsvRows(input) {
  const rows=[]; let row=[], cell='', quoted=false;
  const src=String(input||'').replace(/^\uFEFF/,'');
  for(let i=0;i<src.length;i++){const c=src[i];if(quoted){if(c==='"'&&src[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.replace(/\r$/,''));if(row.some(v=>String(v).trim()))rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw Error('CSV has an unclosed quoted field.');row.push(cell);if(row.some(v=>String(v).trim()))rows.push(row);
  if(!rows.length)return [];const headers=rows.shift().map(x=>String(x).trim().toLowerCase().replace(/[ -]+/g,'_'));
  return rows.map((r,index)=>Object.fromEntries(headers.map((h,i)=>[h,String(r[i]??'').trim()]).concat([['_row',index+2]])));
}
function sellerSecretKey(){const raw=process.env.SELLER_CARRIER_ENCRYPTION_KEY||process.env.SECRET||'';if(raw.length<32)throw Error('Set SELLER_CARRIER_ENCRYPTION_KEY (32+ characters) to securely store seller carrier credentials.');return crypto.createHash('sha256').update(raw).digest();}
function encryptSellerSecret(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',sellerSecretKey(),iv);const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);return {cipher:encrypted.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64')};}
function decryptSellerSecret(row){const decipher=crypto.createDecipheriv('aes-256-gcm',sellerSecretKey(),Buffer.from(row.credential_iv,'base64'));decipher.setAuthTag(Buffer.from(row.credential_tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(row.credential_cipher,'base64')),decipher.final()]).toString('utf8');}
async function shiprocketLogin(email,password){const r=await fetch('https://apiv2.shiprocket.in/v1/external/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok||!d.token)throw Error(d.message||'Shiprocket authentication failed.');return d.token;}
function sellerMetrics(sellerId,lookbackDays=30,dispatchSlaHours=48){
 const days=Math.max(7,Math.min(90,Number(lookbackDays)||30)),sla=Math.max(1,Math.min(720,Number(dispatchSlaHours)||48));
 const rows=db.prepare(`SELECT so.id,so.order_id,so.status,so.fulfilment_status,so.dispatched_at,so.dispatch_due_at,so.cancelled_at,so.created_at,
 (SELECT COUNT(*) FROM seller_order_lines l WHERE l.order_id=so.order_id AND l.seller_id=so.seller_id) line_count
 FROM seller_suborders so WHERE so.seller_id=? AND so.created_at>=datetime('now',?) ORDER BY so.id DESC`).all(sellerId,`-${days} days`);
 const eligible=rows.filter(x=>!['cancelled','returned'].includes(x.status));const dispatched=eligible.filter(x=>x.dispatched_at);const late=eligible.filter(x=>x.dispatch_due_at&&new Date(x.dispatch_due_at+'Z').getTime()<Date.now()&&(!x.dispatched_at||new Date(x.dispatched_at+'Z').getTime()>new Date(x.dispatch_due_at+'Z').getTime()));
 const quality=db.prepare("SELECT event_type,COUNT(*) count FROM seller_quality_events WHERE seller_id=? AND created_at>=datetime('now',?) GROUP BY event_type").all(sellerId,`-${days} days`);const cancelled=Number(quality.find(x=>x.event_type==='seller_cancellation')?.count||0),defects=Number(quality.find(x=>x.event_type==='defect')?.count||0);
 const inquiries=db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN answered_at!='' THEN 1 ELSE 0 END) answered,AVG(CASE WHEN response_minutes>0 THEN response_minutes END) avg_minutes FROM seller_inquiries WHERE seller_id=? AND created_at>=datetime('now',?)").get(sellerId,`-${days} days`);
 const total=rows.length,rate=(n,d)=>d?Number((n/d*100).toFixed(2)):0;
 return {periodDays:days,dispatchSlaHours:sla,sampleSize:total,orders:total,lateDispatchCount:late.length,lateDispatchRate:rate(late.length,Math.max(dispatched.length,eligible.length)),cancellationCount:cancelled,cancellationRate:rate(cancelled,total),defectCount:defects,defectRate:rate(defects,total),inquiries:Number(inquiries.total||0),answeredInquiries:Number(inquiries.answered||0),responseRate:rate(Number(inquiries.answered||0),Number(inquiries.total||0)),averageResponseMinutes:Math.round(Number(inquiries.avg_minutes||0)),dispatchedCount:dispatched.length};
}
function enforceSellerPolicy(sellerId,actorId=null){
 const rule=db.prepare('SELECT * FROM seller_policy_rules WHERE id=1').get();if(!rule?.enabled)return {enabled:false,actions:[]};const m=sellerMetrics(sellerId,rule.lookback_days,rule.dispatch_sla_hours);if(m.sampleSize<rule.min_sample_size)return {enabled:true,insufficientSample:true,metrics:m,actions:[]};
 const checks=[['late_dispatch',m.lateDispatchRate,rule.max_late_dispatch_rate,'max'],['cancellation',m.cancellationRate,rule.max_cancellation_rate,'max'],['defect',m.defectRate,rule.max_defect_rate,'max'],...(m.inquiries>0?[['response',m.responseRate,rule.min_response_rate,'min']]:[])];const actions=[];
 for(const [type,value,threshold,mode] of checks){const breached=mode==='min'?value<threshold:value>threshold;if(!breached)continue;const duplicate=db.prepare("SELECT id FROM seller_policy_events WHERE seller_id=? AND event_type=? AND created_at>=datetime('now','-24 hours')").get(sellerId,type);if(duplicate)continue;
 let action=rule.action; if(action==='suspend'){db.prepare("UPDATE sellers SET status='suspended' WHERE id=? AND status='approved'").run(sellerId);db.prepare("UPDATE seller_products SET status='paused' WHERE seller_id=? AND status='active'").run(sellerId);db.prepare("UPDATE products SET is_active=0 WHERE id IN (SELECT product_id FROM seller_products WHERE seller_id=?) AND NOT EXISTS(SELECT 1 FROM seller_products other WHERE other.product_id=products.id AND other.seller_id!=? AND other.status='active')").run(sellerId,sellerId);}else if(action==='pause_listings'){db.prepare("UPDATE seller_products SET status='paused' WHERE seller_id=? AND status='active'").run(sellerId);db.prepare("UPDATE products SET is_active=0 WHERE id IN (SELECT product_id FROM seller_products WHERE seller_id=?) AND NOT EXISTS(SELECT 1 FROM seller_products other WHERE other.product_id=products.id AND other.seller_id!=? AND other.status='active')").run(sellerId,sellerId);}else if(action==='payout_hold'){db.prepare('UPDATE seller_profiles SET payout_hold=1,updated_at=datetime(\'now\') WHERE seller_id=?').run(sellerId);}
 db.prepare('INSERT INTO seller_policy_events(seller_id,event_type,severity,metric_value,threshold_value,action_taken,details_json) VALUES(?,?,?,?,?,?,?)').run(sellerId,type,action,value,threshold,action,JSON.stringify({metrics:m,ruleId:rule.id}));actions.push({type,value,threshold,action});if(actorId)auditLog(actorId,'seller-policy-enforcement','seller',sellerId,{type,value,threshold,action});
 }return {enabled:true,metrics:m,actions};
}

function couponDiscount(coupon, subtotal) {
  if (!coupon || !coupon.active) return 0;
  if (subtotal < coupon.min_order) return 0;
  if (coupon.used_count >= coupon.usage_limit) return 0;
  return coupon.type === 'percentage' ? money(subtotal * coupon.value / 100) : Math.min(coupon.value, subtotal);
}

/* ─────────────── cart helpers (server-side, logged-in users) ─────────────── */
function getServerCart(userId) {
  const rows = db.prepare(`
    SELECT c.product_id AS id, c.qty, c.size, p.slug, p.name, p.price, p.compare_price, p.images, p.stock, p.huid
    FROM cart_items c JOIN products p ON p.id = c.product_id
    WHERE c.user_id = ? AND p.is_active = 1 ORDER BY c.added_at ASC`).all(userId);
  return rows.map(r => ({ ...r, images: JSON.parse(r.images || '[]') }));
}

/* ════════════════════════════ ROUTES ════════════════════════════ */
function recordMarketplaceTcs(orderId) {
  const cfg=db.prepare('SELECT * FROM marketplace_tax_settings WHERE id=1').get();
  if(!cfg?.enabled||!cfg.operator_gstin)return 0;
  const operatorState=cfg.operator_gstin.slice(0,2);
  const rows=db.prepare(`SELECT so.*,s.id seller_id,k.gstin FROM seller_suborders so JOIN sellers s ON s.id=so.seller_id LEFT JOIN seller_profiles k ON k.seller_id=s.id WHERE so.order_id=?`).all(orderId);
  let count=0;
  for(const row of rows){if(!row.gstin||row.gstin.length!==15)continue;const intra=row.gstin.slice(0,2)===operatorState;const rate=intra?Number(cfg.tcs_intra_rate):Number(cfg.tcs_inter_rate);const amount=Math.round(Number(row.gross_amount)*rate/100);db.prepare(`INSERT OR IGNORE INTO marketplace_tax_ledger(order_id,seller_id,seller_suborder_id,state_of_supply,taxable_value,tcs_rate,tcs_amount,tax_type,status) VALUES(?,?,?,?,?,?,?,?, 'accrued')`).run(orderId,row.seller_id,row.id,row.gstin.slice(0,2),row.gross_amount,rate,amount,intra?'CGST+SGST':'IGST');db.prepare('UPDATE seller_suborders SET tax_tcs_amount=? WHERE id=?').run(amount,row.id);count++;}
  return count;
}

async function executeRouteTransfer(id,actorId){
  if(process.env.RAZORPAY_ROUTE_ENABLED!=='true')return {ok:false,error:'Razorpay Route is not enabled.'};
  if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)return {ok:false,error:'Razorpay Route credentials are missing.'};
  const row=db.prepare(`SELECT so.*,k.provider_account_id,k.kyc_status,k.bank_status,k.payout_hold,s.status seller_status,o.payment_id,o.payment_status,o.payment_method,o.status order_status FROM seller_suborders so JOIN seller_profiles k ON k.seller_id=so.seller_id JOIN sellers s ON s.id=so.seller_id JOIN orders o ON o.id=so.order_id WHERE so.id=?`).get(id);
  if(!row)return {ok:false,error:'Sub-order not found.'};if(row.payout_transfer_id)return {ok:true,alreadyReleased:true,transferId:row.payout_transfer_id};if(row.payout_eligible_at&&db.prepare("SELECT datetime(?)>datetime('now') future").get(row.payout_eligible_at)?.future)return {ok:false,error:'Seller payout hold/return window has not elapsed yet.'};
  if(row.payment_method!=='razorpay'||row.order_status!=='delivered'||row.payment_status!=='paid'||db.prepare("SELECT id FROM refunds WHERE order_id=? AND status NOT IN ('failed','rejected') LIMIT 1").get(row.order_id)||db.prepare("SELECT id FROM return_requests WHERE order_id=? AND status NOT IN ('rejected','closed') LIMIT 1").get(row.order_id)||row.seller_status!=='approved'||row.kyc_status!=='verified'||row.bank_status!=='verified'||row.payout_hold||!row.provider_account_id||!row.payment_id)return {ok:false,error:'Not eligible: payment, delivery, KYC, bank, linked account or refund gate.'};
  const amount=Math.max(0,row.seller_amount-(row.tax_tcs_amount||0));if(amount<=0)return {ok:false,error:'No payable seller balance after TCS.'};
  const reserved=db.prepare("UPDATE seller_suborders SET status='transfer_initiating',updated_at=datetime('now') WHERE id=? AND payout_transfer_id='' AND status='delivered'").run(id);if(reserved.changes!==1)return {ok:false,error:'Transfer already in progress or sub-order is not eligible.'};
  try{const auth=Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');const form=new URLSearchParams();form.set('transfers[0][account]',row.provider_account_id);form.set('transfers[0][amount]',String(amount*100));form.set('transfers[0][currency]','INR');form.set('transfers[0][notes][chandrahasa_suborder]',String(id));const rr=await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(row.payment_id)}/transfers`,{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:form.toString(),signal:AbortSignal.timeout(15000)});const rd=await rr.json();const transfer=rd.items?.[0]||rd;if(!rr.ok||!transfer.id)throw Error('Transfer not confirmed');db.prepare("UPDATE seller_suborders SET payout_transfer_id=?,status='transfer_initiated',updated_at=datetime('now') WHERE id=? AND payout_transfer_id=''").run(transfer.id,id);if(actorId)auditLog(actorId,'route-transfer','seller_suborder',id,{transfer_id:transfer.id});return {ok:true,transferId:transfer.id,status:transfer.status||'created'};}catch{db.prepare("UPDATE seller_suborders SET status='transfer_unknown',updated_at=datetime('now') WHERE id=? AND status='transfer_initiating'").run(id);return {ok:false,unknown:true,error:'Transfer outcome unknown; reconcile in Razorpay before retrying.'};}
}

async function runAutomaticRoutePayouts(){
  if(process.env.AUTO_ROUTE_PAYOUTS!=='true'||process.env.RAZORPAY_ROUTE_ENABLED!=='true')return;
  const due=db.prepare(`SELECT so.id FROM seller_suborders so JOIN orders o ON o.id=so.order_id JOIN sellers s ON s.id=so.seller_id JOIN seller_profiles k ON k.seller_id=s.id WHERE so.status='delivered' AND so.payout_transfer_id='' AND so.payout_eligible_at<=datetime('now') AND o.status='delivered' AND o.payment_status='paid' AND o.payment_method='razorpay' AND s.status='approved' AND k.kyc_status='verified' AND k.bank_status='verified' AND k.payout_hold=0 AND k.provider_account_id!='' AND NOT EXISTS(SELECT 1 FROM refunds r WHERE r.order_id=o.id AND r.status NOT IN ('failed','rejected')) AND NOT EXISTS(SELECT 1 FROM return_requests rr WHERE rr.order_id=o.id AND rr.status NOT IN ('rejected','closed')) ORDER BY so.id LIMIT 20`).all();
  for(const row of due){const result=await executeRouteTransfer(row.id,null);if(!result.ok)console.warn('[route-payout-scheduler]',row.id,result.error);}
}

async function route(req, res, pathname, query) {
  const method = req.method.toUpperCase();
  const body = (method === 'POST' || method === 'PATCH' || method === 'PUT') ? await parseBody(req) : null;
  if (body?.__payloadTooLarge) return json(res, 413, { error: pathname === '/api/admin/media' ? 'Image upload exceeds the 8 MB limit.' : 'Request body exceeds the 1 MB limit.' });
  if ((method === 'POST' || method === 'PATCH' || method === 'PUT') && body === null && !(pathname==='/api/seller/catalog/bulk' && String(req.headers['content-type']||'').includes('text/csv'))) return json(res, 400, { error: 'Malformed JSON request.' });
  const user = getUser(req);

  /* ── CSRF bootstrap ─────────────────────── */
  if (pathname === '/api/security/csrf' && method === 'GET') return issueCsrf(req, res);

  /* ── Health ─────────────────────────────── */
  if (pathname === '/api/health') {
    try { const integrity = db.pragma('quick_check', { simple: true }); if (integrity !== 'ok') throw new Error(integrity);
      return json(res, 200, { ok: true, service: 'chandrahasa', database: 'ok', time: new Date().toISOString() });
    } catch { return json(res, 503, { ok: false, service: 'chandrahasa', database: 'error' }); }
  }

  /* Public payment readiness: expose no secret material. */
  if (pathname === '/api/payments/config' && method === 'GET') {
    const enabled = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET);
    return json(res, 200, { enabled, keyId: enabled ? process.env.RAZORPAY_KEY_ID : '' });
  }

  /* ── AUTH ───────────────────────────────── */
  if (pathname === '/api/auth/signup' && method === 'POST') {
    if (rateLimited('signup:' + clientIp(req), 5, 600000)) return json(res, 429, { error: 'Too many attempts. Try again later.' });
    const name = clean(body?.name, 80), email = clean(body?.email, 254).toLowerCase(), phone = clean(body?.phone, 20), password = String(body?.password || '');
    const ownerSetupKey = String(body?.ownerSetupKey || '');
    const adminPanelSignup = body?.adminPanel === true;
    if (!name || !validEmail(email)) return json(res, 400, { error: 'Please provide a valid name and email.' });
    if (password.length < 16 || password.length > 128) return json(res, 400, { error: 'Password must be 16–128 characters.' });

    // The first account is the only account that can become the store owner.
    // BEGIN IMMEDIATE serializes concurrent first-signup attempts across requests.
    const register = db.transaction(() => {
      const accountCount = Number(db.prepare('SELECT COUNT(*) AS count FROM users').get().count);
      const isFirstAccount = accountCount === 0;
      if (isFirstAccount) {
        if (!adminPanelSignup) return { error: 'The first store-owner account must be created from the private /admin setup page.', status: 403 };
        const expectedKey = String(process.env.OWNER_SETUP_KEY || '');
        if (expectedKey.length < 32 || !constantTimeEqual(ownerSetupKey, expectedKey)) {
          return { error: 'Owner setup is locked. Enter the private owner setup key supplied for this store.' , status: 403 };
        }
      }
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
        return { error: 'An account with this email already exists.', status: 409 };
      }
      const role = isFirstAccount ? 'admin' : 'customer';
      const salt = crypto.randomBytes(16).toString('hex');
      const info = db.prepare('INSERT INTO users (name,email,phone,password_hash,salt,role) VALUES (?,?,?,?,?,?)')
        .run(name, email, phone, scrypt(password, salt), salt, role);
      const { token, expires } = createSession(info.lastInsertRowid);
      if (isFirstAccount) auditLog(Number(info.lastInsertRowid), 'owner_bootstrap', 'user', info.lastInsertRowid, { method: 'first_signup' });
      return { user: { id: Number(info.lastInsertRowid), name, email, phone, role }, token, expires, status: 201 };
    });
    const result = register.immediate();
    if (result.error) return json(res, result.status, { error: result.error });
    return json(res, result.status, { user: result.user }, { 'Set-Cookie': sessionCookie(result.token, result.expires) });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    if (rateLimited('login:' + clientIp(req), 10, 600000)) return json(res, 429, { error: 'Too many attempts. Try again in 10 minutes.' });
    const email = clean(body?.email, 254).toLowerCase(), password = String(body?.password || '');
    if (password.length > 128) return json(res, 400, { error: 'Invalid email or password.' });
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!row) return json(res, 401, { error: 'Invalid email or password.' });
    const hash = scrypt(password, row.salt);
    const a = Buffer.from(hash), b = Buffer.from(row.password_hash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return json(res, 401, { error: 'Invalid email or password.' });
    const { token, expires } = createSession(row.id);
    return json(res, 200, { user: { id: row.id, name: row.name, email: row.email, phone: row.phone, role: row.role } }, { 'Set-Cookie': sessionCookie(token, expires) });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const { ch_session } = parseCookies(req);
    if (ch_session) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(ch_session));
    return json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    return json(res, 200, { user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } : null });
  }

  if (pathname === '/api/auth/me' && method === 'PATCH') {
    if (!user) return json(res, 401, { error: 'Not signed in.' });
    const name = clean(body?.name, 80), phone = clean(body?.phone, 20);
    if (name) db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone, user.id);
    const fresh = db.prepare('SELECT id,name,email,phone,role FROM users WHERE id = ?').get(user.id);
    return json(res, 200, { user: fresh });
  }

  if (pathname === '/api/auth/forgot' && method === 'POST') {
    if (rateLimited('forgot:' + clientIp(req), 5, 600000)) return json(res, 429, { error: 'Too many attempts. Try later.' });
    const email = clean(body?.email, 254).toLowerCase();
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    let resetLink = null;
    if (row) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha256(token), row.id, expires);
      resetLink = `/reset-password?token=${token}`;
      if (process.env.RESEND_API_KEY) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.RESEND_API_KEY },
            body: JSON.stringify({ from: process.env.MAIL_FROM || 'Chandrahasa <hello@chandrahasa.com>', to: email, subject: 'Reset your Chandrahasa password', html: `<p>Reset your password (valid 30 minutes):</p><p><a href="${resetLink}">${resetLink}</a></p>` }),
          });
          resetLink = null; // sent via email, don't leak into UI
        } catch (e) { console.error('Resend failed, falling back to demo link:', e.message); }
      }
    }
    // Never return a reset token to a browser in production. Without an email provider, use the private Railway recovery script.
    if (isProd) resetLink = null;
    // Always 200 — never reveal whether an email is registered
    return json(res, 200, { ok: true, resetLink });
  }

  if (pathname === '/api/auth/reset' && method === 'POST') {
    const token = String(body?.token || ''), password = String(body?.password || '');
    if (password.length < 16 || password.length > 128) return json(res, 400, { error: 'Password must be 16–128 characters.' });
    const row = db.prepare("SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')").get(sha256(token));
    if (!row) return json(res, 400, { error: 'This reset link is invalid or has expired.' });
    const salt = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(scrypt(password, salt), salt, row.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?').run(sha256(token));
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
    return json(res, 200, { ok: true });
  }

  /* ── CATALOG ────────────────────────────── */
  if (pathname === '/api/categories' && method === 'GET') {
    const rows = db.prepare('SELECT name, slug, image, sort_order FROM categories ORDER BY sort_order').all();
    const counts = db.prepare(`SELECT category_slug, COUNT(*) n FROM products WHERE is_active = 1 AND ${PUBLIC_CATALOG_FILTER} GROUP BY category_slug`).all();
    const map = Object.fromEntries(counts.map(c => [c.category_slug, c.n]));
    const grouped = new Map();
    for (const row of rows) {
      const count = Number(map[row.slug] || 0);
      if (!count) continue;
      const canonical = storefrontCategory(row.name, row.slug);
      if (!canonical) continue;
      const existing = grouped.get(canonical.slug);
      if (existing) {
        existing.count += count;
        if (!existing.image && row.image) existing.image = row.image;
      } else {
        grouped.set(canonical.slug, { ...canonical, image: row.image || '', count, sort_order: row.sort_order });
      }
    }
    return json(res, 200, { categories: [...grouped.values()].sort((a,b) => a.sort_order - b.sort_order).map(({sort_order,...category}) => category) });
  }

  if (pathname === '/api/products' && method === 'GET') {
    const category = clean(query.get('category') || '', 60);
    const purity = clean(query.get('purity') || '', 40);
    const search = clean(query.get('search') || '', 80);
    const min = toInt(query.get('min'), 0), max = toInt(query.get('max'), 1000000);
    const badge = clean(query.get('badge') || '', 40);
    const inStock = query.get('inStock') === '1';
    const saleOnly = query.get('sale') === '1';
    const sort = query.get('sort') || 'newest';
    const page = Math.max(1, toInt(query.get('page'), 1));
    const limit = Math.min(48, Math.max(1, toInt(query.get('limit'), 24)));
    let where = `WHERE is_active = 1 AND ${PUBLIC_CATALOG_FILTER} AND price BETWEEN ? AND ?`;
    const args = [min, max];
    if (category && category !== 'all') {
      const canonicalFilter = storefrontCategory(category, category);
      if (!canonicalFilter) return json(res, 200, { items: [], total: 0, page, pages: 0 });
      const normalized = canonicalFilter.slug;
      const known = db.prepare('SELECT name,slug FROM categories').all();
      const matching = known.filter(row => { const canonical = storefrontCategory(row.name, row.slug); return canonical && canonical.slug === normalized; }).map(row => row.slug);
      const candidates = [...new Set([...matching, category])];
      where += ` AND category_slug IN (${candidates.map(() => '?').join(',')})`;
      args.push(...candidates);
    }
    if (badge) { where += ' AND badge = ?'; args.push(badge); }
    if (purity) { where += ' AND purity LIKE ?'; args.push('%' + purity + '%'); }
    if (inStock) where += ' AND stock > 0';
    if (saleOnly) where += ' AND compare_price IS NOT NULL AND compare_price > price';
    if (search) { where += ' AND (name LIKE ? OR description LIKE ? OR huid LIKE ? OR category_slug IN (SELECT slug FROM categories WHERE name LIKE ?))'; args.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
    const orderBy = { newest: 'created_at DESC, id DESC', 'price-asc': 'price ASC', 'price-desc': 'price DESC', popular: 'review_count DESC', rating: 'rating DESC' }[sort] || 'created_at DESC, id DESC';
    const total = db.prepare(`SELECT COUNT(*) n FROM products ${where}`).get(...args).n;
    const items = db.prepare(`SELECT * FROM products ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit).map(productRow);
    return json(res, 200, { items, total, page, pages: Math.ceil(total / limit) });
  }

  let m;
  if ((m = pathname.match(/^\/api\/products\/([a-z0-9-]+)$/)) && method === 'GET') {
    const row = db.prepare(`SELECT * FROM products WHERE slug = ? AND is_active = 1 AND ${PUBLIC_CATALOG_FILTER}`).get(m[1]);
    if (!row) return json(res, 404, { error: 'Product not found.' });
    const product = productRow(row);
    const seller = db.prepare("SELECT s.id,s.name FROM seller_products sp JOIN sellers s ON s.id=sp.seller_id WHERE sp.product_id=? AND sp.status='active' AND s.status='approved' ORDER BY sp.id LIMIT 1").get(row.id)||null;
    const reviews = db.prepare('SELECT author, rating, title, body, created_at FROM reviews WHERE product_id = ? ORDER BY created_at DESC LIMIT 20').all(row.id);
    const related = db.prepare(`SELECT * FROM products WHERE category_slug = ? AND id != ? AND is_active = 1 AND ${PUBLIC_CATALOG_FILTER} ORDER BY review_count DESC LIMIT 4`).all(row.category_slug, row.id).map(productRow);
    return json(res, 200, { product:{...product,seller}, reviews, related });
  }

  if ((m = pathname.match(/^\/api\/products\/([a-z0-9-]+)\/reviews$/)) && method === 'POST') {
    if (!user) return json(res, 401, { error: 'Please sign in to write a review.' });
    const row = db.prepare('SELECT id FROM products WHERE slug = ?').get(m[1]);
    if (!row) return json(res, 404, { error: 'Product not found.' });
    const rating = toInt(body?.rating, 0);
    if (rating < 1 || rating > 5) return json(res, 400, { error: 'Rating must be between 1 and 5.' });
    const title = clean(body?.title, 120), text = clean(body?.body, 1000);
    db.prepare('INSERT INTO reviews (product_id, user_id, author, rating, title, body) VALUES (?,?,?,?,?,?)')
      .run(row.id, user.id, user.name, rating, title, text);
    const agg = db.prepare('SELECT AVG(rating) avg, COUNT(*) n FROM reviews WHERE product_id = ?').get(row.id);
    db.prepare('UPDATE products SET rating = ROUND(?,1), review_count = ? WHERE id = ?').run(agg.avg || rating, agg.n, row.id);
    return json(res, 201, { ok: true });
  }

  /* ── CART (server-side for signed-in users) ── */
  if (pathname === '/api/cart' && method === 'GET') {
    return json(res, 200, { items: user ? getServerCart(user.id) : [] });
  }
  if (pathname === '/api/cart/items' && method === 'POST') {
    if (!user) return json(res, 401, { error: 'Sign in to sync your cart.' });
    const productId = toInt(body?.productId); const qty = Math.min(20, Math.max(1, toInt(body?.qty, 1))); const size = clean(body?.size, 10);
    const prod = db.prepare('SELECT id, stock FROM products WHERE id = ? AND is_active = 1').get(productId);
    if (!prod) return json(res, 404, { error: 'Product not found.' });
    const existing = db.prepare('SELECT qty FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ?').get(user.id, productId, size);
    const newQty = Math.min(prod.stock, (existing ? existing.qty : 0) + qty);
    if (newQty === 0) return json(res, 400, { error: 'This piece is out of stock.' });
    db.prepare(`INSERT INTO cart_items (user_id, product_id, qty, size) VALUES (?,?,?,?)
      ON CONFLICT(user_id, product_id, size) DO UPDATE SET qty = excluded.qty`).run(user.id, productId, newQty, size);
    return json(res, 200, { items: getServerCart(user.id) });
  }
  if ((m = pathname.match(/^\/api\/cart\/items\/(\d+)$/))) {
    if (!user) return json(res, 401, { error: 'Not signed in.' });
    const productId = toInt(m[1]); const size = clean(query.get('size'), 10);
    if (method === 'PATCH') {
      const qty = toInt(body?.qty, 1);
      if (qty <= 0) db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ?').run(user.id, productId, size);
      else db.prepare('UPDATE cart_items SET qty = MIN(?, 20) WHERE user_id = ? AND product_id = ? AND size = ?').run(qty, user.id, productId, size);
      return json(res, 200, { items: getServerCart(user.id) });
    }
    if (method === 'DELETE') {
      db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ?').run(user.id, productId, size);
      return json(res, 200, { items: getServerCart(user.id) });
    }
  }
  if (pathname === '/api/cart/merge' && method === 'POST') {
    if (!user) return json(res, 401, { error: 'Not signed in.' });
    const items = Array.isArray(body?.items) ? body.items.slice(0, 50) : [];
    const upsert = db.prepare(`INSERT INTO cart_items (user_id, product_id, qty, size) VALUES (?,?,?,?)
      ON CONFLICT(user_id, product_id, size) DO UPDATE SET qty = MIN(20, cart_items.qty + excluded.qty)`);
    const tx = db.transaction(() => {
      for (const it of items) {
        const pid = toInt(it.productId); if (pid > 0) upsert.run(user.id, pid, Math.max(1, toInt(it.qty, 1)), clean(it.size, 10));
      }
    });
    tx();
    return json(res, 200, { items: getServerCart(user.id) });
  }
  if (pathname === '/api/cart/clear' && method === 'POST') {
    if (user) db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(user.id);
    return json(res, 200, { ok: true });
  }

  /* ── COUPONS ────────────────────────────── */
  if (pathname === '/api/coupons/apply' && method === 'POST') {
    const code = clean(body?.code, 40).toUpperCase();
    const subtotal = toInt(body?.subtotal, 0);
    const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get(code);
    if (!coupon) return json(res, 200, { valid: false, message: 'That code doesn’t look right.' });
    if (subtotal < coupon.min_order) return json(res, 200, { valid: false, message: `Add ₹${(coupon.min_order - subtotal).toLocaleString('en-IN')} more to use ${code}.` });
    if (coupon.used_count >= coupon.usage_limit) return json(res, 200, { valid: false, message: 'This code has been fully redeemed.' });
    const discount = couponDiscount(coupon, subtotal);
    return json(res, 200, { valid: true, code, discount, message: `${code} applied — you saved ₹${discount.toLocaleString('en-IN')} ✦` });
  }

  /* ── ORDERS ─────────────────────────────── */
  if (pathname === '/api/orders' && method === 'POST') {
    if (body?.paymentMethod === 'razorpay' && (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)) return json(res, 503, { error: 'Online payments are not configured. Choose cash on delivery or contact the store.' });
    const email = clean(body?.email, 254).toLowerCase();
    const phone = clean(body?.phone, 20);
    const address = body?.address || {};
    const items = Array.isArray(body?.items) ? body.items.slice(0, 50) : [];
    const couponCode = clean(body?.couponCode || '', 40).toUpperCase();
    const giftWrap = body?.giftWrap === true;
    const giftCharge = giftWrap ? 49 : 0;
    const giftCardCode = clean(body?.giftCardCode||'',32).toUpperCase();
    const pointsRequested = Math.max(0,Math.min(100000,toInt(body?.loyaltyPoints,0)));
    if((giftCardCode||pointsRequested)&&!user) return json(res,401,{error:'Sign in to redeem gift cards or loyalty points.'});
    const paymentMethod = ['razorpay', 'cod'].includes(body?.paymentMethod) ? body.paymentMethod : 'razorpay';
    const idemRaw = clean(req.headers['idempotency-key'] || body?.idempotencyKey || '', 128);
    const idemHash = idemRaw ? sha256(idemRaw) : '';
    if (idemRaw && !/^[A-Za-z0-9._:-]{8,128}$/.test(idemRaw)) return json(res, 400, { error: 'Invalid checkout idempotency key.' });
    if (paymentMethod === 'cod' && !idemHash) return json(res, 400, { error: 'Checkout security key missing. Refresh checkout and try again.' });
    if (!validEmail(email)) return json(res, 400, { error: 'A valid email is required.' });
    if (!/^\+?[0-9\s-]{10,15}$/.test(phone)) return json(res, 400, { error: 'Enter a valid phone number.' });
    const addr = {
      name: clean(address.name, 80), line1: clean(address.line1, 120), line2: clean(address.line2, 120),
      city: clean(address.city, 60), state: clean(address.state, 60), pincode: clean(address.pincode, 6),
    };
    if (!addr.name || !addr.line1 || !addr.city || !/^[1-9][0-9]{5}$/.test(addr.pincode)) {
      return json(res, 400, { error: 'Please complete your address (6-digit pincode starting 1–9).' });
    }
    if (!items.length) return json(res, 400, { error: 'Your bag is empty.' });
    const requestHash = sha256(JSON.stringify({ userId: user?.id || null, email, phone, address: addr, items: items.map(it => ({ productId: toInt(it.productId), qty: Math.max(1, Math.min(10, toInt(it.qty, 1))), size: clean(it.size, 10) })), couponCode, giftWrap, giftCardCode, pointsRequested, paymentMethod }));
    if (paymentMethod === 'cod') {
      const prior = db.prepare('SELECT request_hash, response_json FROM checkout_idempotency WHERE key_hash = ?').get(idemHash);
      if (prior) {
        if (prior.request_hash !== requestHash) return json(res, 409, { error: 'This checkout key was already used for different order details. Refresh checkout to start a new order.' });
        const saved = JSON.parse(prior.response_json || '{}');
        if (saved.orderId && saved.confirmationToken) return json(res, 200, saved);
        return json(res, 409, { error: 'This order is still being processed. Please wait and check your orders before retrying.' });
      }
    }

    // Validate every line server-side — never trust client prices
    const enriched = [];
    let subtotal = 0;
    for (const it of items) {
      const p = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(toInt(it.productId));
      if (!p) return json(res, 400, { error: 'One of the items no longer exists.' });
      const qty = Math.max(1, Math.min(10, toInt(it.qty, 1)));
      if (p.stock < qty) return json(res, 400, { error: `Only ${p.stock} left of ${p.name}.` });
      subtotal += p.price * qty;
      enriched.push({ p, qty, size: clean(it.size, 10) });
    }
    const coupon = couponCode ? db.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get(couponCode) : null;
    const discount = couponDiscount(coupon, subtotal);
    const shipping = subtotal - discount >= 999 ? 0 : 79;
    const grossTotal = subtotal - discount + shipping + giftCharge;
    let giftCardApplied=0, loyaltyPointsApplied=0;
    if(pointsRequested){const earned=db.prepare('SELECT COALESCE(SUM(points),0) n FROM loyalty_ledger WHERE user_id=?').get(user.id).n;const already=db.prepare('SELECT COALESCE(SUM(points),0) n FROM loyalty_redemptions WHERE user_id=?').get(user.id).n;const available=Math.max(0,earned-already);loyaltyPointsApplied=Math.min(pointsRequested,available,Math.floor(grossTotal*0.20));}
    let giftCard=null;
    if(giftCardCode){giftCard=db.prepare('SELECT * FROM gift_cards WHERE code=? AND active=1').get(giftCardCode);if(!giftCard||(giftCard.expires_at&&new Date(giftCard.expires_at)<new Date()))return json(res,400,{error:'Gift card is invalid, inactive or expired.'});giftCardApplied=Math.min(giftCard.balance,Math.max(0,grossTotal-loyaltyPointsApplied));}
    const total = Math.max(0,grossTotal-loyaltyPointsApplied-giftCardApplied);
    const confirmationToken = crypto.randomBytes(32).toString('hex');
    const marketplaceTaxConfig=db.prepare('SELECT enabled FROM marketplace_tax_settings WHERE id=1').get();if(marketplaceTaxConfig?.enabled){for(const item of enriched){const sellerTax=db.prepare("SELECT k.gstin FROM seller_products sp JOIN sellers s ON s.id=sp.seller_id JOIN seller_profiles k ON k.seller_id=s.id WHERE sp.product_id=? AND sp.status='active' AND s.status='approved' ORDER BY sp.id LIMIT 1").get(item.p.id);if(sellerTax&&!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(sellerTax.gstin||''))return json(res,409,{error:'A marketplace seller is not GST verified. Please remove this item or contact support.'});}}

    let orderId;
    let cachedCheckout = null;
    let checkoutResponse = null;
    const tx = db.transaction(() => {
      if (paymentMethod === 'cod') {
        const inserted = db.prepare("INSERT OR IGNORE INTO checkout_idempotency (key_hash, request_hash, response_json) VALUES (?,?, '{}')").run(idemHash, requestHash);
        if (inserted.changes === 0) {
          const prior = db.prepare('SELECT request_hash, response_json FROM checkout_idempotency WHERE key_hash = ?').get(idemHash);
          if (!prior || prior.request_hash !== requestHash) { const e = new Error('IDEMPOTENCY_CONFLICT'); e.code = 'IDEMPOTENCY_CONFLICT'; throw e; }
          const saved = JSON.parse(prior.response_json || '{}');
          if (!saved.orderId || !saved.confirmationToken) { const e = new Error('IDEMPOTENCY_IN_PROGRESS'); e.code = 'IDEMPOTENCY_IN_PROGRESS'; throw e; }
          cachedCheckout = saved;
          return;
        }
      }
      const info = db.prepare(`INSERT INTO orders
        (user_id, email, phone, subtotal, discount, shipping, total, coupon_code, status, payment_method, payment_status, address, confirmation_token_hash)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        user ? user.id : null, email, phone, subtotal, discount, shipping, total,
        coupon ? coupon.code : null, (paymentMethod === 'cod' || total===0) ? 'confirmed' : 'pending', paymentMethod, total===0?'paid':'created', JSON.stringify({ ...addr, giftWrap, giftCharge }), sha256(confirmationToken));
      orderId = Number(info.lastInsertRowid);
      if(total===0) db.prepare("INSERT INTO payments(order_id,gateway,payment_id,method,amount,status,signature) VALUES(?,?,?,?,?,'paid','wallet-settled')").run(orderId,'store_wallet',`wallet_${orderId}`,'gift_card_loyalty',0);
      if(giftCardApplied>0){const debit=db.prepare('UPDATE gift_cards SET balance=balance-? WHERE code=? AND active=1 AND balance>=?').run(giftCardApplied,giftCardCode,giftCardApplied);if(debit.changes!==1)throw new Error('Gift card balance changed during checkout.');db.prepare("INSERT INTO gift_card_ledger(code,order_id,amount,kind) VALUES(?,?,?,'redeem')").run(giftCardCode,orderId,-giftCardApplied);db.prepare('INSERT INTO gift_card_redemptions(code,order_id,amount) VALUES(?,?,?)').run(giftCardCode,orderId,giftCardApplied);}
      if(loyaltyPointsApplied>0){const earned=db.prepare('SELECT COALESCE(SUM(points),0) n FROM loyalty_ledger WHERE user_id=?').get(user.id).n;const used=db.prepare('SELECT COALESCE(SUM(points),0) n FROM loyalty_redemptions WHERE user_id=?').get(user.id).n;if(earned-used<loyaltyPointsApplied)throw new Error('Loyalty balance changed during checkout.');db.prepare('INSERT INTO loyalty_redemptions(user_id,order_id,points,rupees) VALUES(?,?,?,?)').run(user.id,orderId,loyaltyPointsApplied,loyaltyPointsApplied);db.prepare("INSERT INTO loyalty_ledger(user_id,points,reason,order_id) VALUES(?,?,'checkout_redemption',?)").run(user.id,-loyaltyPointsApplied,orderId);}
      const insItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, image, price, qty, size, huid) VALUES (?,?,?,?,?,?,?,?)');
      for (const { p, qty, size } of enriched) {
        const stockUpdate = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?').run(qty, p.id, qty);
        if (stockUpdate.changes !== 1) throw new Error('Stock changed during checkout; retry order.');
        insItem.run(orderId, p.id, p.name, JSON.parse(p.images || '[]')[0] || '', p.price, qty, size, p.huid);
        const listing=db.prepare("SELECT sp.seller_id,s.commission_rate,k.gstin FROM seller_products sp JOIN sellers s ON s.id=sp.seller_id JOIN seller_profiles k ON k.seller_id=s.id WHERE sp.product_id=? AND sp.status='active' AND s.status='approved' AND k.kyc_status='verified' ORDER BY sp.id LIMIT 1").get(p.id);
        if(listing){const gross=p.price*qty,commission=Math.round(gross*Math.max(0,Math.min(50,Number(listing.commission_rate)||10))/100),sellerAmount=gross-commission;const wh=db.prepare('SELECT id FROM seller_warehouses WHERE seller_id=? AND is_default=1 AND active=1 ORDER BY id LIMIT 1').get(listing.seller_id);const so=db.prepare("INSERT INTO seller_suborders(order_id,seller_id,warehouse_id,status,gross_amount,commission_amount,seller_amount) VALUES(?,?,?,'pending',?,?,?) ON CONFLICT(order_id,seller_id) DO UPDATE SET gross_amount=gross_amount+excluded.gross_amount,commission_amount=commission_amount+excluded.commission_amount,seller_amount=seller_amount+excluded.seller_amount RETURNING id").get(orderId,listing.seller_id,wh?.id||null,gross,commission,sellerAmount);const slaHours=Number(db.prepare('SELECT dispatch_sla_hours FROM seller_policy_rules WHERE id=1').get()?.dispatch_sla_hours||48);db.prepare("UPDATE seller_suborders SET dispatch_due_at=CASE WHEN dispatch_due_at='' THEN datetime('now','+' || ? || ' hours') ELSE dispatch_due_at END WHERE id=?").run(slaHours,so.id);const li=db.prepare('INSERT INTO seller_order_lines(order_id,seller_id,product_id,qty,gross_amount,commission_amount,seller_amount) VALUES(?,?,?,?,?,?,?)').run(orderId,listing.seller_id,p.id,qty,gross,commission,sellerAmount);db.prepare("INSERT INTO seller_ledger(seller_id,order_line_id,amount,kind) VALUES(?,?,?,'order_pending')").run(listing.seller_id,Number(li.lastInsertRowid),sellerAmount);if(wh){const inv=db.prepare('SELECT quantity,reserved FROM warehouse_inventory WHERE warehouse_id=? AND product_id=?').get(wh.id,p.id);if(inv){const changed=db.prepare('UPDATE warehouse_inventory SET reserved=reserved+?,updated_at=datetime(\'now\') WHERE warehouse_id=? AND product_id=? AND quantity-reserved>=?').run(qty,wh.id,p.id,qty);if(changed.changes!==1)throw new Error('Seller warehouse stock changed during checkout.');db.prepare('INSERT INTO inventory_movements(warehouse_id,product_id,delta,reason,reference) VALUES(?,?,?,\'order_reserved\',?)').run(wh.id,p.id,-qty,String(orderId));}} }
      }
      if (coupon) { const cu = db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ? AND active = 1 AND used_count < usage_limit').run(coupon.id); if (cu.changes !== 1) throw new Error('Coupon usage limit reached; please retry checkout.'); }
      if (user) db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(user.id);
      checkoutResponse = {orderId, confirmationToken, total, subtotal, discount, shipping, giftWrap, giftCharge, giftCardApplied, loyaltyPointsApplied, payment:{key:'', gatewayOrderId:'', currency:'INR', amount:total*100, method:paymentMethod}, cod:paymentMethod==='cod'||total===0};
      if (paymentMethod === 'cod') db.prepare('UPDATE checkout_idempotency SET response_json=? WHERE key_hash=?').run(JSON.stringify(checkoutResponse), idemHash);
    });
    try { tx(); } catch (e) {
      if (e.code === 'IDEMPOTENCY_CONFLICT') return json(res, 409, { error: 'This checkout key was already used for different order details. Refresh checkout to start a new order.' });
      if (e.code === 'IDEMPOTENCY_IN_PROGRESS') return json(res, 409, { error: 'This order is still being processed. Please wait and check your orders before retrying.' });
      throw e;
    }
    if (cachedCheckout) return json(res, 200, cachedCheckout);

    let gatewayOrderId = '';
    if (paymentMethod === 'razorpay' && total>0) {
      try {
        const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
        const gatewayRes = await fetch('https://api.razorpay.com/v1/orders', { method:'POST', headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/json'}, body:JSON.stringify({amount:total*100,currency:'INR',receipt:`chandrahasa_${orderId}`,notes:{store_order_id:String(orderId)}}),signal:AbortSignal.timeout(12000)});
        const gatewayData = await gatewayRes.json();
        if (!gatewayRes.ok || !gatewayData.id) throw new Error('Gateway order creation failed');
        gatewayOrderId = gatewayData.id; db.prepare('UPDATE orders SET gateway_order_id=? WHERE id=?').run(gatewayOrderId,orderId);
      } catch (e) { return json(res, 502, {error:'Payment gateway could not initialize. Retry or choose COD.'}); }
    }
    checkoutResponse.payment.key = process.env.RAZORPAY_KEY_ID || '';
    checkoutResponse.payment.gatewayOrderId = gatewayOrderId;
    return json(res, 201, checkoutResponse);
  }

  if(pathname==='/api/marketplace/kyc/webhook' && method==='POST'){
    const secret=process.env.SELLER_KYC_WEBHOOK_SECRET;if(!secret)return json(res,503,{error:'Seller KYC webhook is not configured.'});const sig=clean(req.headers['x-chandrahasa-kyc-signature']||'',200),raw=req.rawBody||'',expected=crypto.createHmac('sha256',secret).update(raw).digest('hex');const a=Buffer.from(expected),b=Buffer.from(sig);if(!sig||a.length!==b.length||!crypto.timingSafeEqual(a,b))return json(res,401,{error:'KYC provider signature invalid.'});const eventId=clean(body?.eventId,160),sellerId=toInt(body?.sellerId),kyc=clean(body?.kycStatus,20),bank=clean(body?.bankStatus,20),account=clean(body?.linkedAccountId,100);if(!eventId||!sellerId||!['under_review','verified','rejected'].includes(kyc)||!['pending','verified','rejected'].includes(bank))return json(res,400,{error:'Invalid KYC event payload.'});const hash=sha256(raw);try{db.prepare('INSERT INTO seller_provider_events(provider,event_id,seller_id,event_type,payload_hash) VALUES(?,?,?,?,?)').run(clean(body?.provider||'configured_kyc_provider',40),eventId,sellerId,'seller.kyc.updated',hash);}catch{return json(res,200,{ok:true,duplicate:true});}db.prepare("UPDATE seller_profiles SET kyc_status=?,bank_status=?,provider_kyc_status=?,provider_account_id=CASE WHEN ?!='' THEN ? ELSE provider_account_id END,payout_hold=CASE WHEN ?='verified' AND ?='verified' AND ?!='' THEN 0 ELSE 1 END,bank_verified_at=CASE WHEN ?='verified' THEN datetime('now') ELSE bank_verified_at END,updated_at=datetime('now') WHERE seller_id=?").run(kyc,bank,kyc,account,account,kyc,bank,account,bank,sellerId);if(process.env.AUTO_ROUTE_PAYOUTS==='true'&&process.env.RAZORPAY_ROUTE_ENABLED==='true'&&kyc==='verified'&&bank==='verified'&&account){const eligible=db.prepare("SELECT so.id FROM seller_suborders so JOIN orders o ON o.id=so.order_id WHERE so.seller_id=? AND o.status='delivered' AND o.payment_status='paid' AND o.payment_method='razorpay' AND so.status='delivered'").all(sellerId);for(const sub of eligible){const result=await executeRouteTransfer(sub.id,null);if(!result.ok)console.warn('[route-payout-kyc]',sub.id,result.error);}}return json(res,200,{ok:true});
  }

  if (pathname === '/api/payments/webhook' && method === 'POST') {
    const secret=process.env.RAZORPAY_WEBHOOK_SECRET; if(!secret) return json(res,503,{error:'Webhook secret not configured'});
    const sig=clean(req.headers['x-razorpay-signature']||'',200), raw=req.rawBody||'';
    const expected=crypto.createHmac('sha256',secret).update(raw).digest('hex');
    const aa=Buffer.from(expected),bb=Buffer.from(sig); if(!sig||aa.length!==bb.length||!crypto.timingSafeEqual(aa,bb)) return json(res,400,{error:'Webhook signature invalid'});
    const event=body?.event, payment=body?.payload?.payment?.entity, gatewayOrder=body?.payload?.order?.entity;
    const eventId=clean(body?.event_id||body?.id||'',150);
    // Durable, retryable webhook inbox. A failed handler must not poison the
    // idempotency key forever: only 'processed' events are acknowledged as done.
    const dedupeId=eventId||crypto.createHash('sha256').update(raw).digest('hex');
    try { db.prepare("INSERT OR IGNORE INTO webhook_events(event_id,event,payload,status) VALUES(?,?,?,'pending')").run(dedupeId,event||'unknown',raw); }
    catch { return json(res,500,{error:'Webhook persistence failed'}); }
    const prior=db.prepare('SELECT status,processing_started_at FROM webhook_events WHERE event_id=?').get(dedupeId);
    if(prior?.status==='processed') return json(res,200,{ok:true,duplicate:true});
    if(prior?.status==='processing'){
      const active=prior.processing_started_at&&db.prepare("SELECT datetime(?)>datetime('now','-2 minutes') active").get(prior.processing_started_at)?.active;
      if(active)return json(res,202,{ok:true,processing:true});
      db.prepare("UPDATE webhook_events SET status='failed' WHERE event_id=? AND status='processing'").run(dedupeId);
    }
    const claimed=db.prepare("UPDATE webhook_events SET status='processing',attempts=attempts+1,processing_started_at=datetime('now'),last_error='' WHERE event_id=? AND status IN ('pending','failed')").run(dedupeId);
    if(!claimed.changes) return json(res,200,{ok:true,duplicate:true});
    try {
    if(event==='payment.captured' && payment?.id && payment?.order_id){
      const order=db.prepare('SELECT * FROM orders WHERE gateway_order_id=?').get(payment.order_id);
      if(order && Number(payment.amount)===order.total*100 && payment.currency==='INR'){
        if(order.status==='cancelled'){
          // A late capture must never resurrect a cancelled order or consume stock
          // that was already released. Keep the order cancelled and flag refund review.
          db.prepare("UPDATE orders SET payment_status='paid',payment_id=? WHERE id=?").run(payment.id,order.id);
          db.prepare('INSERT OR IGNORE INTO payments(order_id,gateway,payment_id,method,amount,status,signature) VALUES(?,?,?,?,?,?,?)').run(order.id,'razorpay',payment.id,payment.method||'online',order.total,'paid',sig);
          db.prepare('INSERT INTO security_events(event_type,actor_user_id,ip_hash,detail) VALUES(?,?,?,?)').run('payment_captured_after_cancellation',order.user_id||null,'',JSON.stringify({order_id:order.id,payment_id:payment.id}));
          enqueueNotification('payment.captured_after_cancellation',String(order.id),{orderId:order.id,paymentId:payment.id,amount:order.total,requiresRefundReview:true});
        } else {
        const items=db.prepare('SELECT product_id,qty FROM order_items WHERE order_id=?').all(order.id);
        const tx=db.transaction(()=>{
          const released=db.prepare('SELECT 1 FROM stock_releases WHERE order_id=?').get(order.id);
          if(released){
            // Late capture after failure release: atomically attempt to re-reserve stock.
            let canReserve=true; for(const it of items){if(it.product_id){const u=db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').run(it.qty,it.product_id,it.qty);if(u.changes!==1)canReserve=false;}}
            if(!canReserve){ // roll back reservation attempts and mark as paid but requiring manual inventory resolution
              throw new Error('late-capture stock shortage');
            }
            db.prepare('DELETE FROM stock_releases WHERE order_id=?').run(order.id);
          }
          db.prepare("UPDATE orders SET payment_status='paid',payment_id=?,status='confirmed' WHERE id=? AND payment_status!='paid'").run(payment.id,order.id);
          db.prepare('INSERT OR IGNORE INTO payments(order_id,gateway,payment_id,method,amount,status,signature) VALUES(?,?,?,?,?,?,?)').run(order.id,'razorpay',payment.id,payment.method||'online',order.total,'paid',sig);
          recordMarketplaceTcs(order.id);
        });
        try{tx();}catch(e){ // stock shortage on late capture: retain the payment and flag for manual fulfilment
          db.prepare("UPDATE orders SET payment_status='paid',payment_id=?,status='pending' WHERE id=?").run(payment.id,order.id);
          db.prepare('INSERT OR IGNORE INTO payments(order_id,gateway,payment_id,method,amount,status,signature) VALUES(?,?,?,?,?,?,?)').run(order.id,'razorpay',payment.id,payment.method||'online',order.total,'paid',sig);
          recordMarketplaceTcs(order.id);
        }
        }
      } else if(order) {
        db.prepare('INSERT INTO security_events(event_type,actor_user_id,ip_hash,detail) VALUES(?,?,?,?)').run('payment_webhook_amount_mismatch',order.user_id||null,'',JSON.stringify({order_id:order.id,payment_id:payment?.id,amount:payment?.amount,currency:payment?.currency}));
      }
    }
    if(event==='payment.failed' && payment?.id){
      // A failed attempt does not prove that the entire Razorpay order is unpaid:
      // customers may retry with another instrument. Keep inventory reserved until
      // explicit order expiry/reconciliation confirms that no captured payment exists.
      const ord=db.prepare('SELECT * FROM orders WHERE gateway_order_id=?').get(payment.order_id);
      if(ord && ord.payment_status==='created') {
        db.prepare('INSERT INTO security_events(event_type,actor_user_id,ip_hash,detail) VALUES(?,?,?,?)')
          .run('payment_attempt_failed',ord.user_id||null,'',JSON.stringify({order_id:ord.id,payment_id:payment.id,reason:payment.error_code||'failed'}));
      }
    }
    if((event==='refund.processed' || event==='refund.created' || event==='refund.failed') && body?.payload?.refund?.entity?.id){
      const refund=body.payload.refund.entity;
      const paymentId=refund.payment_id;
      const order=db.prepare('SELECT * FROM orders WHERE payment_id=?').get(paymentId);
      if(order){
        db.prepare('INSERT INTO refunds(order_id,gateway_refund_id,payment_id,amount,status) VALUES(?,?,?,?,?) ON CONFLICT(gateway_refund_id) DO UPDATE SET status=excluded.status')
          .run(order.id,refund.id,paymentId,Math.round((refund.amount||0)/100),refund.status||event);db.prepare("UPDATE return_fulfilment SET refund_status=?,updated_at=datetime('now') WHERE refund_reference=?").run(refund.status||event,refund.id);
        const refunded=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM refunds WHERE order_id=? AND status IN ('processed','completed')").get(order.id).total;
        const paid=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE order_id=? AND status IN ('paid','refund_pending','refunded')").get(order.id).total;
        if(refunded>0){
          db.prepare("UPDATE orders SET payment_status=CASE WHEN ? >= ? THEN 'refunded' ELSE 'paid' END WHERE id=?").run(refunded,paid,order.id);
          if(refunded>=paid) db.prepare("UPDATE payments SET status='refunded' WHERE order_id=?").run(order.id);
        }
      }
    }
    if(['transfer.processed','transfer.reversed','transfer.failed'].includes(event)){const tr=body?.payload?.transfer?.entity;if(tr?.id){const sub=db.prepare('SELECT id FROM seller_suborders WHERE payout_transfer_id=?').get(tr.id);if(sub){const next=event==='transfer.processed'?'paid':event==='transfer.reversed'?'transfer_reversed':'transfer_failed';db.prepare("UPDATE seller_suborders SET status=?,updated_at=datetime('now') WHERE id=?").run(next,sub.id);enqueueNotification(`seller.${event}`,String(sub.id),{suborderId:sub.id,transferId:tr.id,status:next});}}}
    if(event==='payment.captured'&&payment?.id){const order=db.prepare('SELECT id,total,payment_status FROM orders WHERE gateway_order_id=?').get(payment.order_id);if(order&&order.payment_status==='paid'&&order.status!=='cancelled')enqueueNotification('payment.captured',`${order.id}:${payment.id}`,{orderId:order.id,paymentId:payment.id,amount:order.total,currency:'INR',status:'paid'});}
    if(event==='refund.processed'||event==='refund.failed'){const refund=body?.payload?.refund?.entity;if(refund?.id)enqueueNotification(event,refund.id,{refundId:refund.id,paymentId:refund.payment_id,status:refund.status||event,amount:Math.round((refund.amount||0)/100)});}
    db.prepare("UPDATE webhook_events SET status='processed',processed_at=datetime('now'),last_error='' WHERE event_id=?").run(dedupeId);
    return json(res,200,{ok:true});
    } catch (err) {
      db.prepare("UPDATE webhook_events SET status='failed',last_error=? WHERE event_id=?").run(clean(err?.message||'Webhook handler failed',500),dedupeId);
      console.error('[razorpay-webhook]',dedupeId,err?.message||err);
      return json(res,500,{error:'Webhook processing failed; provider retry is safe.'});
    }
  }

  if (pathname === '/api/payments/verify' && method === 'POST') {
    if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET) return json(res,503,{error:'Razorpay verification is not configured'});
    const orderId=toInt(body?.orderId,0), paymentId=clean(body?.razorpay_payment_id,100), gatewayOrderId=clean(body?.razorpay_order_id,100), signature=clean(body?.razorpay_signature,200);
    const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId); if(!order) return json(res,404,{error:'Order not found'});
    if(order.payment_status==='paid') return json(res,200,{ok:true,alreadyPaid:true});
    if(order.payment_method!=='razorpay'||!order.gateway_order_id||order.gateway_order_id!==gatewayOrderId) return json(res,400,{error:'Payment order mismatch'});
    const expected=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET||'').update(`${gatewayOrderId}|${paymentId}`).digest('hex');
    const a=Buffer.from(expected),b=Buffer.from(signature); if(!signature||a.length!==b.length||!crypto.timingSafeEqual(a,b)) return json(res,400,{error:'Payment signature invalid'});
    try {
      const auth=Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
      const vr=await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,{headers:{Authorization:`Basic ${auth}`},signal:AbortSignal.timeout(10000)});
      const vd=await vr.json();
      if(!vr.ok || vd.order_id!==gatewayOrderId || vd.amount!==order.total*100 || vd.currency!=='INR' || vd.status!=='captured') return json(res,400,{error:'Gateway payment is not captured or does not match this order.'});
    } catch { return json(res,502,{error:'Could not confirm payment with Razorpay. Refresh order status before retrying.'}); }
    const tx=db.transaction(()=>{
      const updated=order.status==='cancelled'
        ? db.prepare("UPDATE orders SET payment_status='paid',payment_id=? WHERE id=? AND payment_status!='paid'").run(paymentId,orderId)
        : db.prepare("UPDATE orders SET payment_status='paid',payment_id=?,status='confirmed' WHERE id=? AND payment_status!='paid'").run(paymentId,orderId);
      if(updated.changes!==1) throw new Error('Order payment state changed; reconcile before retrying.');
      db.prepare('INSERT OR IGNORE INTO payments(order_id,gateway,payment_id,method,amount,status,signature) VALUES(?,?,?,?,?,?,?)').run(orderId,'razorpay',paymentId,'online',order.total,'paid',signature);
      if(order.status==='cancelled'){
        db.prepare('INSERT INTO security_events(event_type,actor_user_id,ip_hash,detail) VALUES(?,?,?,?)').run('payment_verified_after_cancellation',order.user_id||null,'',JSON.stringify({order_id:orderId,payment_id:paymentId}));
        enqueueNotification('payment.captured_after_cancellation',String(orderId),{orderId,paymentId,amount:order.total,requiresRefundReview:true});
      } else recordMarketplaceTcs(orderId);
    });tx();
    return json(res,200,{ok:true,requiresRefundReview:order.status==='cancelled'});
  }

  if (pathname === '/api/payments/cod' && method === 'POST') {
    const orderId = toInt(body?.orderId, 0);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return json(res, 404, { error: 'Order not found.' });
    if (!user || (order.user_id !== user.id && user.role !== 'admin')) return json(res, 403, { error: 'Sign in as the order owner to confirm this order.' });
    if(order.payment_method!=='cod')return json(res,400,{error:'This order is not a cash-on-delivery order.'});
    if(order.status==='confirmed')return json(res,200,{ok:true,unchanged:true});
    const transitionError=validateOrderTransition(order,'confirmed');
    if(transitionError)return json(res,409,{error:transitionError});
    const changed=db.prepare("UPDATE orders SET status='confirmed' WHERE id=? AND status='pending' AND payment_method='cod'").run(orderId);
    if(!changed.changes)return json(res,409,{error:'Order state changed; refresh and retry.'});
    enqueueNotification('order.cod_confirmed',String(orderId),{orderId,paymentMethod:'cod',status:'confirmed'});
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/orders/mine' && method === 'GET') {
    if (!user) return json(res, 401, { error: 'Not signed in.' });
    const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
    const out = orders.map(o => ({
      ...o, address: JSON.parse(o.address || '{}'),
      items: db.prepare('SELECT name, image, price, qty, size, huid FROM order_items WHERE order_id = ?').all(o.id),
    }));
    return json(res, 200, { orders: out });
  }

  if ((m = pathname.match(/^\/api\/orders\/(\d+)$/)) && method === 'GET') {
    if (!user && !query.get('token')) return json(res, 403, { error: 'Sign in or provide the order confirmation token.' });
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(toInt(m[1]));
    if (!order) return json(res, 404, { error: 'Order not found.' });
    const isOwner = user && (order.user_id === user.id || user.role === 'admin');
    const confirmationToken = query.get('token') || '';
    const isGuestConfirmation = !order.user_id && confirmationToken && order.confirmation_token_hash
      && crypto.timingSafeEqual(Buffer.from(order.confirmation_token_hash), Buffer.from(sha256(confirmationToken)));
    if (!isOwner && !isGuestConfirmation) return json(res, 403, { error: 'Sign in to the account that placed this order or use its confirmation link.' });
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    return json(res, 200, { order: { ...order, address: JSON.parse(order.address || '{}'), items } });
  }

  /* ── WISHLIST ───────────────────────────── */
  if (pathname === '/api/wishlist' && method === 'GET') {
    if (!user) return json(res, 200, { items: [] });
    const items = db.prepare(`SELECT p.* FROM wishlists w JOIN products p ON p.id = w.product_id WHERE w.user_id = ? ORDER BY w.created_at DESC`).all(user.id).map(productRow);
    return json(res, 200, { items });
  }
  if (pathname === '/api/wishlist' && method === 'POST') {
    if (!user) return json(res, 401, { error: 'Sign in to save your wishlist.' });
    const productId = toInt(body?.productId);
    const exists = db.prepare('SELECT 1 FROM wishlists WHERE user_id = ? AND product_id = ?').get(user.id, productId);
    if (exists) db.prepare('DELETE FROM wishlists WHERE user_id = ? AND product_id = ?').run(user.id, productId);
    else db.prepare('INSERT INTO wishlists (user_id, product_id) VALUES (?,?)').run(user.id, productId);
    return json(res, 200, { wishlisted: !exists });
  }

  /* ── NEWSLETTER + CONTACT ───────────────── */
  if (pathname === '/api/newsletter' && method === 'POST') {
    const email = clean(body?.email, 254).toLowerCase();
    if (!validEmail(email)) return json(res, 400, { error: 'Enter a valid email.' });
    try { db.prepare('INSERT INTO newsletter (email) VALUES (?)').run(email); } catch { /* duplicate — fine */ }
    return json(res, 200, { ok: true, message: 'Welcome to the Chandrahasa Circle ✦' });
  }
  if (pathname === '/api/contact' && method === 'POST') {
    const name = clean(body?.name, 80), email = clean(body?.email, 254).toLowerCase(), subject = clean(body?.subject, 120), message = clean(body?.message, 2000);
    if (!name || !validEmail(email) || message.length < 10) return json(res, 400, { error: 'Please fill in every field (message 10+ characters).' });
    db.prepare('INSERT INTO contacts (name, email, subject, message) VALUES (?,?,?,?)').run(name, email, subject, message);
    return json(res, 201, { ok: true, message: 'Message received — we reply within 24 hours.' });
  }

  /* ── ADVANCED COMMERCE: SELLER, WALLET, CONCIERGE ───────── */

  if(pathname==='/api/seller/catalog/template.csv' && method==='GET'){
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare('SELECT id FROM sellers WHERE user_id=?').get(user.id);if(!seller)return json(res,404,{error:'Seller account not found.'});
    res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="chandrahasa-seller-catalog-template.csv"','Cache-Control':'no-store'});return res.end('seller_sku,name,category_slug,description,price,stock,image_path\nSKU-001,Silver Floral Ring,rings,925 sterling silver floral ring,2499,10,/assets/img/rings.webp\n');
  }
  if(pathname==='/api/seller/catalog/bulk' && method==='POST'){
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare("SELECT s.* FROM sellers s JOIN seller_profiles k ON k.seller_id=s.id WHERE s.user_id=? AND s.status='approved' AND k.kyc_status='verified'").get(user.id);if(!seller)return json(res,403,{error:'Approved seller and verified KYC are required.'});
    let rows=[],source='json';try{if(req.headers['content-type']?.includes('text/csv')){rows=parseCsvRows(req.rawBody||'');source='csv';}else{rows=Array.isArray(body?.rows)?body.rows:[];}}catch(e){return json(res,400,{error:e.message});}
    if(!rows.length||rows.length>500)return json(res,400,{error:'Upload between 1 and 500 catalogue rows per batch.'});
    const results=[];let created=0,updated=0,rejected=0;
    for(let i=0;i<rows.length;i++){const r=rows[i]||{},rowNo=Number(r._row)||i+1;try{
      const sku=clean(r.seller_sku||r.sku,60),name=clean(r.name||r.product_name,120),category=clean(r.category_slug||r.category,60).toLowerCase(),description=clean(r.description,3000),price=toInt(r.price),stock=toInt(r.stock),image=clean(r.image_path||r.image,240);
      if(!sku||name.length<3||!db.prepare('SELECT slug FROM categories WHERE slug=?').get(category)||price<1||price>10000000||stock<0||stock>100000)throw Error('Required: unique seller_sku, product name, valid category_slug, price and stock.');
      if(!validSellerImagePath(image))throw Error('image_path must point to an existing local /assets image file.');
      const existing=db.prepare('SELECT sp.*,p.slug FROM seller_products sp JOIN products p ON p.id=sp.product_id WHERE sp.seller_id=? AND sp.seller_sku=?').get(seller.id,sku);
      if(existing){db.transaction(()=>{db.prepare("UPDATE seller_products SET price_override=?,stock_override=?,status='pending' WHERE id=?").run(price,stock,existing.id);db.prepare("UPDATE products SET name=?,category_slug=?,description=?,price=?,stock=?,images=CASE WHEN ?!='' THEN ? ELSE images END,is_active=0 WHERE id=?").run(name,category,description,price,stock,image,JSON.stringify(image?[image]:[]),existing.product_id);syncSellerWarehouseStock(seller.id,existing.product_id,stock,user.id);})();updated++;results.push({row:rowNo,sku,status:'updated_pending_review'});}
      else{const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55)+'-'+crypto.randomBytes(4).toString('hex');db.transaction(()=>{const p=db.prepare("INSERT INTO products(slug,name,category_slug,description,price,images,stock,artisan,is_active) VALUES(?,?,?,?,?,?,?, ?,0)").run(slug,name,category,description,price,JSON.stringify(image?[image]:[]),stock,seller.name);db.prepare("INSERT INTO seller_products(seller_id,product_id,seller_sku,price_override,stock_override,status) VALUES(?,?,?,?,?,'pending')").run(seller.id,Number(p.lastInsertRowid),sku,price,stock);syncSellerWarehouseStock(seller.id,Number(p.lastInsertRowid),stock,user.id);})();created++;results.push({row:rowNo,sku,status:'created_pending_review'});}
    }catch(e){rejected++;results.push({row:rowNo,sku:clean(r.seller_sku||r.sku,60),status:'rejected',error:String(e.message||'Invalid row').slice(0,240)});}}
    const job=db.prepare('INSERT INTO seller_bulk_jobs(seller_id,source,total_rows,created_count,updated_count,rejected_count,report_json) VALUES(?,?,?,?,?,?,?)').run(seller.id,source,rows.length,created,updated,rejected,JSON.stringify(results));auditLog(user.id,'seller-bulk-catalog','seller',seller.id,{jobId:Number(job.lastInsertRowid),created,updated,rejected});return json(res,200,{jobId:Number(job.lastInsertRowid),total:rows.length,created,updated,rejected,results,message:'Valid rows were submitted for catalogue review. Listings remain hidden until admin approval.'});
  }
  if(pathname==='/api/seller/catalog/bulk-jobs' && method==='GET'){
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare('SELECT id FROM sellers WHERE user_id=?').get(user.id);if(!seller)return json(res,404,{error:'Seller account not found.'});return json(res,200,{jobs:db.prepare('SELECT id,source,total_rows,created_count,updated_count,rejected_count,status,created_at FROM seller_bulk_jobs WHERE seller_id=? ORDER BY id DESC LIMIT 30').all(seller.id)});
  }
  if((m=pathname.match(/^\/api\/seller\/catalog\/bulk-jobs\/(\d+)$/))&&method==='GET'){
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare('SELECT id FROM sellers WHERE user_id=?').get(user.id);if(!seller)return json(res,404,{error:'Seller account not found.'});const job=db.prepare('SELECT * FROM seller_bulk_jobs WHERE id=? AND seller_id=?').get(toInt(m[1]),seller.id);if(!job)return json(res,404,{error:'Bulk import job not found.'});let results=[];try{results=JSON.parse(job.report_json||'[]')}catch{}return json(res,200,{job:{id:job.id,source:job.source,total:job.total_rows,created:job.created_count,updated:job.updated_count,rejected:job.rejected_count,status:job.status,createdAt:job.created_at},results});
  }
  if(pathname==='/api/seller/carriers/shiprocket' && method==='POST'){
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare("SELECT id FROM sellers WHERE user_id=? AND status='approved'").get(user.id);if(!seller)return json(res,403,{error:'Approved seller required.'});const email=clean(body?.email,254).toLowerCase(),password=String(body?.password||''),pickup=clean(body?.pickupLocation||'Primary',100);if(!validEmail(email)||password.length<8)return json(res,400,{error:'Enter valid Shiprocket account email and password.'});
    try{const token=await shiprocketLogin(email,password);const encrypted=encryptSellerSecret(JSON.stringify({email,password}));db.prepare(`INSERT INTO seller_carrier_accounts(seller_id,provider,credential_cipher,credential_iv,credential_tag,pickup_location,status,last_verified_at,last_error) VALUES(?,'shiprocket',?,?,?,?,'connected',datetime('now'),'') ON CONFLICT(seller_id,provider) DO UPDATE SET credential_cipher=excluded.credential_cipher,credential_iv=excluded.credential_iv,credential_tag=excluded.credential_tag,pickup_location=excluded.pickup_location,status='connected',last_verified_at=datetime('now'),last_error='',updated_at=datetime('now')`).run(seller.id,encrypted.cipher,encrypted.iv,encrypted.tag,pickup);auditLog(user.id,'connect-seller-carrier','seller',seller.id,{provider:'shiprocket'});return json(res,200,{ok:true,provider:'Shiprocket',status:'connected',pickupLocation:pickup,verified:true});}catch(e){return json(res,400,{error:e.message||'Could not verify Shiprocket account.'});}
  }
  if(pathname==='/api/seller/carriers' && method==='GET'){
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare('SELECT id FROM sellers WHERE user_id=?').get(user.id);if(!seller)return json(res,404,{error:'Seller account not found.'});return json(res,200,{carriers:db.prepare("SELECT provider,pickup_location,status,last_verified_at,last_error,updated_at FROM seller_carrier_accounts WHERE seller_id=?").all(seller.id)});
  }
  if((m=pathname.match(/^\/api\/seller\/suborders\/(\d+)\/shipment$/))&&method==='POST'){
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare("SELECT id FROM sellers WHERE user_id=? AND status='approved'").get(user.id);if(!seller)return json(res,403,{error:'Approved seller required.'});const sid=toInt(m[1]);const sub=db.prepare('SELECT so.*,o.email,o.phone,o.address,o.payment_method,o.status order_status,o.payment_status FROM seller_suborders so JOIN orders o ON o.id=so.order_id WHERE so.id=? AND so.seller_id=?').get(sid,seller.id);if(!sub)return json(res,404,{error:'Seller sub-order not found.'});const shippingEligible=sub.payment_status==='paid'||(sub.payment_method==='cod'&&['confirmed','shipped','out_for_delivery'].includes(sub.order_status));if(!shippingEligible||['cancelled','returned'].includes(sub.status))return json(res,409,{error:'Only captured prepaid or confirmed COD seller sub-orders can be shipped.'});const prior=db.prepare('SELECT * FROM seller_shipments WHERE suborder_id=?').get(sid);if(prior?.shipment_id||prior?.status==='creating'||prior?.status==='unknown')return json(res,409,{error:'Shipment already exists or provider outcome is unknown. Reconcile in Shiprocket before retrying.',shipment:prior?{shipmentId:prior.shipment_id,awb:prior.awb,status:prior.status}:null});const carrier=db.prepare("SELECT * FROM seller_carrier_accounts WHERE seller_id=? AND provider='shiprocket' AND status='connected'").get(seller.id);if(!carrier)return json(res,409,{error:'Connect and verify your own Shiprocket account first.'});const dispatchWarehouse=sub.warehouse_id?db.prepare('SELECT id FROM seller_warehouses WHERE id=? AND seller_id=? AND active=1').get(sub.warehouse_id,seller.id):db.prepare('SELECT id FROM seller_warehouses WHERE seller_id=? AND is_default=1 AND active=1 ORDER BY id LIMIT 1').get(seller.id);if(!dispatchWarehouse)return json(res,409,{error:'Add an active default seller warehouse before creating a carrier shipment.'});if(!sub.warehouse_id)db.prepare('UPDATE seller_suborders SET warehouse_id=? WHERE id=? AND warehouse_id IS NULL').run(dispatchWarehouse.id,sid);
    const reservation=db.prepare("INSERT INTO seller_shipments(seller_id,suborder_id,status) VALUES(?,?,'creating') ON CONFLICT(suborder_id) DO UPDATE SET status='creating',last_error='' WHERE seller_shipments.status='failed'").run(seller.id,sid);const state=db.prepare('SELECT * FROM seller_shipments WHERE suborder_id=?').get(sid);if(state.status!=='creating')return json(res,409,{error:'Shipment reservation is already active.'});
    try{const creds=JSON.parse(decryptSellerSecret(carrier)),token=await shiprocketLogin(creds.email,creds.password),addr=JSON.parse(sub.address||'{}'),lines=db.prepare('SELECT l.*,p.name,p.weight FROM seller_order_lines l JOIN products p ON p.id=l.product_id WHERE l.order_id=? AND l.seller_id=?').all(sub.order_id,seller.id);if(!lines.length)throw Error('No seller order lines found.');const items=lines.map(x=>({name:x.name,sku:`CH-S${seller.id}-P${x.product_id}`,units:x.qty,selling_price:x.gross_amount/Math.max(1,x.qty)}));const weight=lines.reduce((n,x)=>n+(parseFloat(String(x.weight||'').replace(/[^0-9.]/g,''))||250)/1000*x.qty,0);const payload={order_id:`CH-S${seller.id}-SO${sid}`,order_date:new Date().toISOString().slice(0,10),pickup_location:carrier.pickup_location,billing_customer_name:clean(addr.name||'Customer',80),billing_last_name:'',billing_address:clean(addr.line1||addr.address||'',180),billing_address_2:clean(addr.line2||'',180),billing_city:clean(addr.city||'',80),billing_pincode:clean(addr.pincode||'',6),billing_state:clean(addr.state||'',80),billing_country:'India',billing_email:sub.email,billing_phone:sub.phone,shipping_is_billing:true,order_items:items,payment_method:sub.payment_method==='cod'?'COD':'Prepaid',sub_total:sub.gross_amount,shipping_charges:0,order_weight:Math.max(.1,Number(weight.toFixed(3)))};const hash=sha256(JSON.stringify(payload));const rr=await fetch('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});const rd=await rr.json();if(!rr.ok||!rd.shipment_id)throw Error(rd.message||'Shiprocket shipment creation failed.');db.prepare("UPDATE seller_shipments SET provider_order_id=?,shipment_id=?,awb=?,status='created',payload_hash=?,updated_at=datetime('now') WHERE suborder_id=?").run(String(rd.order_id||''),String(rd.shipment_id),String(rd.awb_code||''),hash,sid);db.prepare("UPDATE seller_suborders SET fulfilment_status='label_pending',dispatched_at=CASE WHEN ?!='' THEN datetime('now') ELSE dispatched_at END,updated_at=datetime('now') WHERE id=?").run(String(rd.awb_code||''),sid);auditLog(user.id,'seller-create-shipment','seller_suborder',sid,{shipmentId:rd.shipment_id,awb:rd.awb_code||''});return json(res,201,{ok:true,shipmentId:rd.shipment_id,providerOrderId:rd.order_id||null,awb:rd.awb_code||null,status:'created'});}catch(e){db.prepare("UPDATE seller_shipments SET status='unknown',last_error=?,updated_at=datetime('now') WHERE suborder_id=?").run(clean(e.message,300),sid);return json(res,502,{error:'Carrier request failed or outcome is uncertain. Check your Shiprocket account before retrying; duplicate shipment protection is active.'});}
  }


  if((m=pathname.match(/^\/api\/seller\/suborders\/(\d+)\/shipping-options$/))&&method==='GET'){
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare('SELECT id FROM sellers WHERE user_id=?').get(user.id);if(!seller)return json(res,404,{error:'Seller account not found.'});const sid=toInt(m[1]),sub=db.prepare('SELECT so.*,o.address,o.payment_method FROM seller_suborders so JOIN orders o ON o.id=so.order_id WHERE so.id=? AND so.seller_id=?').get(sid,seller.id);if(!sub)return json(res,404,{error:'Seller sub-order not found.'});const sh=db.prepare('SELECT * FROM seller_shipments WHERE suborder_id=? AND seller_id=?').get(sid,seller.id);if(!sh||!sh.shipment_id)return json(res,409,{error:'Create the seller shipment before checking courier rates.'});const carrier=db.prepare("SELECT * FROM seller_carrier_accounts WHERE seller_id=? AND provider='shiprocket'").get(seller.id);if(!carrier)return json(res,409,{error:'Connect your Shiprocket account first.'});const wh=sub.warehouse_id?db.prepare('SELECT address_json FROM seller_warehouses WHERE id=? AND seller_id=?').get(sub.warehouse_id,seller.id):null;if(!wh)return json(res,409,{error:'Add a seller warehouse and make it the default dispatch location before requesting courier rates.'});try{const pickup=JSON.parse(wh.address_json||'{}'),dest=JSON.parse(sub.address||'{}'),lines=db.prepare('SELECT l.qty,p.weight FROM seller_order_lines l JOIN products p ON p.id=l.product_id WHERE l.order_id=? AND l.seller_id=?').all(sub.order_id,seller.id),weight=Math.max(.1,lines.reduce((n,x)=>n+(parseFloat(String(x.weight||'').replace(/[^0-9.]/g,''))||250)/1000*x.qty,0));if(!/^\d{6}$/.test(String(pickup.pincode||''))||!/^\d{6}$/.test(String(dest.pincode||'')))return json(res,400,{error:'Valid six-digit pickup and delivery PIN codes are required.'});const c=JSON.parse(decryptSellerSecret(carrier)),token=await shiprocketLogin(c.email,c.password),url=new URL('https://apiv2.shiprocket.in/v1/external/courier/serviceability/');url.searchParams.set('pickup_postcode',pickup.pincode);url.searchParams.set('delivery_postcode',dest.pincode);url.searchParams.set('weight',String(Number(weight.toFixed(3))));url.searchParams.set('cod',sub.payment_method==='cod'?'1':'0');const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)}),d=await r.json();if(!r.ok)throw Error(d.message||'Courier serviceability lookup failed.');const options=d.data?.available_courier_companies||d.available_courier_companies||[];return json(res,200,{options:options.map(x=>({courierId:Number(x.courier_company_id),name:clean(x.courier_name,100),rate:Number(x.rate||x.freight_charge||0),etd:clean(x.etd||x.estimated_delivery_days||'',80),rating:Number(x.rating||0)})),pickupPincode:pickup.pincode,deliveryPincode:dest.pincode,weight:Number(weight.toFixed(3)),cod:sub.payment_method==='cod'});}catch(e){return json(res,502,{error:e.message||'Courier rate lookup failed.'});}
  }
  if((m=pathname.match(/^\/api\/seller\/suborders\/(\d+)\/shipment\/awb$/))&&method==='POST'){
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare('SELECT id FROM sellers WHERE user_id=?').get(user.id);if(!seller)return json(res,404,{error:'Seller account not found.'});const sid=toInt(m[1]),sh=db.prepare('SELECT * FROM seller_shipments WHERE suborder_id=? AND seller_id=?').get(sid,seller.id);if(!sh)return json(res,404,{error:'Shipment not found.'});if(sh.awb)return json(res,200,{ok:true,awb:sh.awb,alreadyAssigned:true});if(['awb_assigning','awb_unknown'].includes(sh.status))return json(res,409,{error:'AWB assignment outcome is uncertain. Check Shiprocket shipment details before retrying.'});const courierId=toInt(body?.courierId);if(!courierId)return json(res,400,{error:'Enter the courier_id offered by your Shiprocket account.'});const carrier=db.prepare("SELECT * FROM seller_carrier_accounts WHERE seller_id=? AND provider='shiprocket'").get(seller.id);try{db.prepare("UPDATE seller_shipments SET status='awb_assigning',updated_at=datetime('now') WHERE id=?").run(sh.id);const c=JSON.parse(decryptSellerSecret(carrier)),token=await shiprocketLogin(c.email,c.password),r=await fetch('https://apiv2.shiprocket.in/v1/external/courier/assign/awb',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({shipment_id:sh.shipment_id,courier_id:courierId}),signal:AbortSignal.timeout(20000)}),d=await r.json();const awb=d.response?.data?.awb_code||d.awb_code;if(!r.ok||!awb)throw Error(d.message||'AWB assignment failed.');db.prepare("UPDATE seller_shipments SET awb=?,courier_name=?,status='awb_assigned',updated_at=datetime('now') WHERE id=?").run(String(awb),clean(d.response?.data?.courier_name||d.courier_name||'',100),sh.id);db.prepare("UPDATE seller_suborders SET status='shipped',fulfilment_status='dispatched',dispatched_at=datetime('now'),updated_at=datetime('now') WHERE id=?").run(sid);return json(res,200,{ok:true,awb,courierName:d.response?.data?.courier_name||d.courier_name||''});}catch(e){db.prepare("UPDATE seller_shipments SET status='awb_unknown',last_error=?,updated_at=datetime('now') WHERE id=? AND status='awb_assigning'").run(clean(e.message,300),sh.id);return json(res,502,{error:'AWB assignment outcome is uncertain. Check Shiprocket before retrying to prevent duplicate assignment.'});}
  }
  if((m=pathname.match(/^\/api\/seller\/suborders\/(\d+)\/shipment\/label$/))&&method==='POST'){
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare('SELECT id FROM sellers WHERE user_id=?').get(user.id);if(!seller)return json(res,404,{error:'Seller account not found.'});const sh=db.prepare('SELECT * FROM seller_shipments WHERE suborder_id=? AND seller_id=?').get(toInt(m[1]),seller.id);if(!sh)return json(res,404,{error:'Shipment not found.'});if(!sh.awb)return json(res,409,{error:'Assign an AWB before generating a label.'});if(sh.label_url)return json(res,200,{ok:true,labelUrl:sh.label_url,alreadyGenerated:true});const carrier=db.prepare("SELECT * FROM seller_carrier_accounts WHERE seller_id=? AND provider='shiprocket'").get(seller.id);try{const c=JSON.parse(decryptSellerSecret(carrier)),token=await shiprocketLogin(c.email,c.password),r=await fetch('https://apiv2.shiprocket.in/v1/external/courier/generate/label',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({shipment_id:[Number(sh.shipment_id)]}),signal:AbortSignal.timeout(20000)}),d=await r.json();const label=d.label_url||d.label_created||d.response?.label_url;if(!r.ok||!label)throw Error(d.message||'Label generation failed.');const safeLabel=new URL(String(label));if(safeLabel.protocol!=='https:')throw Error('Carrier returned an unsafe label URL.');db.prepare("UPDATE seller_shipments SET label_url=?,status='label_ready',updated_at=datetime('now') WHERE id=?").run(safeLabel.toString(),sh.id);return json(res,200,{ok:true,labelUrl:safeLabel.toString()});}catch(e){return json(res,502,{error:e.message||'Label generation failed.'});}
  }
  if((m=pathname.match(/^\/api\/seller\/suborders\/(\d+)\/shipment\/track$/))&&method==='GET'){
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare('SELECT id FROM sellers WHERE user_id=?').get(user.id);if(!seller)return json(res,404,{error:'Seller account not found.'});const sh=db.prepare('SELECT * FROM seller_shipments WHERE suborder_id=? AND seller_id=?').get(toInt(m[1]),seller.id);if(!sh)return json(res,404,{error:'Shipment not found.'});if(!sh.awb)return json(res,409,{error:'AWB not assigned yet.'});const carrier=db.prepare("SELECT * FROM seller_carrier_accounts WHERE seller_id=? AND provider='shiprocket'").get(seller.id);try{const c=JSON.parse(decryptSellerSecret(carrier)),token=await shiprocketLogin(c.email,c.password),r=await fetch(`https://apiv2.shiprocket.in/v1/external/courier/track/awb/${encodeURIComponent(sh.awb)}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)}),d=await r.json();if(!r.ok)throw Error('Tracking provider unavailable');return json(res,200,{shipment:sh,tracking:d});}catch{return json(res,502,{error:'Could not retrieve carrier tracking.'});}
  }
  if(pathname==='/api/seller/performance' && method==='GET'){
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare('SELECT id FROM sellers WHERE user_id=?').get(user.id);if(!seller)return json(res,404,{error:'Seller account not found.'});const rules=db.prepare('SELECT * FROM seller_policy_rules WHERE id=1').get(),metrics=sellerMetrics(seller.id,rules.lookback_days,rules.dispatch_sla_hours);return json(res,200,{metrics,policy:{enabled:!!rules.enabled,action:rules.action,events:db.prepare('SELECT * FROM seller_policy_events WHERE seller_id=? ORDER BY id DESC LIMIT 20').all(seller.id)}});
  }

  if(pathname==='/api/seller/inquiries' && method==='POST'){
    if(!user)return json(res,401,{error:'Sign in to contact this seller.'});const sellerId=toInt(body?.sellerId),productId=toInt(body?.productId),subject=clean(body?.subject,120),message=clean(body?.message,1500);const seller=db.prepare("SELECT id FROM sellers WHERE id=? AND status='approved'").get(sellerId);if(!seller||subject.length<3||message.length<10)return json(res,400,{error:'Choose a valid approved seller and provide a subject and message (10+ characters).'});if(productId&&!db.prepare('SELECT id FROM products WHERE id=? AND is_active=1').get(productId))return json(res,404,{error:'Product not found.'});const r=db.prepare('INSERT INTO seller_inquiries(seller_id,customer_user_id,product_id,subject,message) VALUES(?,?,?,?,?)').run(sellerId,user?.id||null,productId,subject,message);return json(res,201,{id:Number(r.lastInsertRowid),status:'open'});
  }
  if(pathname==='/api/customer/seller-inquiries' && method==='GET'){
    if(!user)return json(res,401,{error:'Sign in required.'});return json(res,200,{inquiries:db.prepare('SELECT i.*,s.name seller_name FROM seller_inquiries i JOIN sellers s ON s.id=i.seller_id WHERE i.customer_user_id=? ORDER BY i.id DESC LIMIT 100').all(user.id)});
  }
  if(pathname==='/api/seller/inquiries' && method==='GET'){
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare('SELECT id FROM sellers WHERE user_id=?').get(user.id);if(!seller)return json(res,404,{error:'Seller account not found.'});return json(res,200,{inquiries:db.prepare('SELECT * FROM seller_inquiries WHERE seller_id=? ORDER BY id DESC LIMIT 100').all(seller.id)});
  }
  if((m=pathname.match(/^\/api\/seller\/inquiries\/(\d+)\/reply$/))&&method==='POST'){
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare('SELECT id FROM sellers WHERE user_id=?').get(user.id);if(!seller)return json(res,404,{error:'Seller account not found.'});const msg=clean(body?.message,2000);if(msg.length<2)return json(res,400,{error:'Reply must contain at least 2 characters.'});const q=db.prepare("SELECT * FROM seller_inquiries WHERE id=? AND seller_id=? AND status='open'").get(toInt(m[1]),seller.id);if(!q)return json(res,404,{error:'Open inquiry not found.'});const mins=Math.max(1,Math.round((Date.now()-new Date(q.created_at+'Z').getTime())/60000));db.prepare("UPDATE seller_inquiries SET status='answered',answered_at=datetime('now'),response_minutes=?,response_message=? WHERE id=?").run(mins,msg,q.id);auditLog(user.id,'seller-inquiry-reply','seller_inquiry',q.id,{responseMinutes:mins,messageLength:msg.length});return json(res,200,{ok:true,responseMinutes:mins,note:'Reply recorded for seller response metrics. Connect customer messaging delivery before treating this as a delivered customer response.'});
  }

  if (pathname==='/api/seller/me' && method==='GET') {
    if(!user) return json(res,401,{error:'Sign in required.'});
    const seller=db.prepare('SELECT * FROM sellers WHERE user_id=?').get(user.id);
    if(!seller) return json(res,404,{error:'No seller application found.'});
    const profile=db.prepare('SELECT * FROM seller_profiles WHERE seller_id=?').get(seller.id)||{};
    const balance=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM seller_ledger WHERE seller_id=? AND kind='order_cleared'").get(seller.id).n;
    const payouts=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM seller_payouts WHERE seller_id=? AND status IN ('requested','approved','processing','paid')").get(seller.id).n;const routePaid=db.prepare("SELECT COALESCE(SUM(seller_amount-tax_tcs_amount),0) n FROM seller_suborders WHERE seller_id=? AND payout_transfer_id!=''").get(seller.id).n;
    const codBalance=db.prepare("SELECT COALESCE(SUM(l.amount),0) n FROM seller_ledger l JOIN seller_order_lines ol ON ol.id=l.order_line_id JOIN orders o ON o.id=ol.order_id WHERE l.seller_id=? AND l.kind='order_cleared' AND o.payment_method='cod' AND o.payment_status='paid'").get(seller.id).n;
    const availableBalance=Math.max(0,profile?.provider_account_id?codBalance-payouts:balance-payouts-routePaid);
    return json(res,200,{seller,profile,availableBalance,products:db.prepare('SELECT sp.*,p.name,p.price,p.stock FROM seller_products sp JOIN products p ON p.id=sp.product_id WHERE sp.seller_id=? ORDER BY sp.id DESC').all(seller.id),orders:db.prepare('SELECT * FROM seller_order_lines WHERE seller_id=? ORDER BY id DESC LIMIT 100').all(seller.id),payouts:db.prepare('SELECT * FROM seller_payouts WHERE seller_id=? ORDER BY id DESC').all(seller.id)});
  }
  if (pathname==='/api/seller/kyc' && method==='POST') {
    if(!user) return json(res,401,{error:'Sign in required.'});
    const seller=db.prepare("SELECT * FROM sellers WHERE user_id=? AND status='approved'").get(user.id);
    if(!seller) return json(res,403,{error:'Seller account must be approved before KYC submission.'});
    const legal=clean(body?.legalName,120),type=clean(body?.businessType,40),gstin=clean(body?.gstin,15).toUpperCase(),pan=clean(body?.panLast4,4),ref=clean(body?.documentReference,80);
    if(legal.length<2||!['individual','proprietorship','partnership','private_limited','llp'].includes(type)||!/^[A-Z0-9]{4}$/.test(pan)||ref.length<6) return json(res,400,{error:'Enter legal name, business type, PAN last four and a secure document reference. Never upload full PAN/bank details in chat.'});
    db.prepare(`INSERT INTO seller_profiles(seller_id,legal_name,business_type,gstin,pan_last4,kyc_status,kyc_reference) VALUES(?,?,?,?,?,'submitted',?) ON CONFLICT(seller_id) DO UPDATE SET legal_name=excluded.legal_name,business_type=excluded.business_type,gstin=excluded.gstin,pan_last4=excluded.pan_last4,kyc_status='submitted',kyc_reference=excluded.kyc_reference,updated_at=datetime('now')`).run(seller.id,legal,type,gstin,pan,ref);
    return json(res,202,{status:'submitted',message:'KYC submitted for manual verification. Seller payouts remain on hold until verified.'});
  }
  if (pathname==='/api/seller/catalog' && method==='POST') {
    if(!user) return json(res,401,{error:'Sign in required.'});
    const seller=db.prepare("SELECT s.* FROM sellers s JOIN seller_profiles k ON k.seller_id=s.id WHERE s.user_id=? AND s.status='approved' AND k.kyc_status='verified'").get(user.id);
    if(!seller)return json(res,403,{error:'Approved seller and verified KYC are required.'});
    const name=clean(body?.name,120),category=clean(body?.categorySlug,60),description=clean(body?.description,3000),price=toInt(body?.price),stock=toInt(body?.stock),image=clean(body?.image,240),sku=clean(body?.sku,60);
    if(name.length<3||!db.prepare('SELECT slug FROM categories WHERE slug=?').get(category)||price<1||price>10000000||stock<0||stock>100000||!sku)return json(res,400,{error:'Enter a valid product name, category, price, stock and seller SKU.'});
    if(!validSellerImagePath(image))return json(res,400,{error:'Product image must be an existing local /assets image file.'});if(db.prepare('SELECT id FROM seller_products WHERE seller_id=? AND seller_sku=?').get(seller.id,sku))return json(res,409,{error:'This seller SKU is already in your catalogue.'});
    const slug=(name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55)||'seller-piece')+'-'+crypto.randomBytes(3).toString('hex');
    const tx=db.transaction(()=>{const r=db.prepare(`INSERT INTO products(slug,name,category_slug,description,price,images,stock,artisan,is_active) VALUES(?,?,?,?,?,?,?, ?,0)`).run(slug,name,category,description,price,JSON.stringify(image?[image]:[]),stock,seller.name);const pid=Number(r.lastInsertRowid);const sp=db.prepare("INSERT INTO seller_products(seller_id,product_id,seller_sku,price_override,stock_override,status) VALUES(?,?,?,?,?,'pending')").run(seller.id,pid,sku,price,stock);syncSellerWarehouseStock(seller.id,pid,stock,user.id);return{id:pid,listingId:Number(sp.lastInsertRowid),slug};});const result=tx();return json(res,201,{...result,status:'pending_review',message:'Listing is hidden until catalogue and compliance review are approved.'});
  }
  if ((m=pathname.match(/^\/api\/seller\/catalog\/(\d+)$/)) && method==='PATCH') {
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare("SELECT s.id FROM sellers s JOIN seller_profiles k ON k.seller_id=s.id WHERE s.user_id=? AND s.status='approved' AND k.kyc_status='verified'").get(user.id);if(!seller)return json(res,403,{error:'Verified seller required.'});const listing=db.prepare('SELECT * FROM seller_products WHERE id=? AND seller_id=?').get(toInt(m[1]),seller.id);if(!listing)return json(res,404,{error:'Listing not found.'});const price=toInt(body?.price),stock=toInt(body?.stock);if(price<1||price>10000000||stock<0||stock>100000)return json(res,400,{error:'Invalid price or stock.'});db.prepare("UPDATE seller_products SET price_override=?,stock_override=?,status='pending' WHERE id=?").run(price,stock,listing.id);db.prepare('UPDATE products SET price=?,stock=?,is_active=0 WHERE id=?').run(price,stock,listing.product_id);return json(res,202,{ok:true,status:'pending_review',message:'Price and inventory changes require review before going live.'});
  }
  if (pathname==='/api/seller/products' && method==='POST') {
    if(!user) return json(res,401,{error:'Sign in required.'});
    const seller=db.prepare("SELECT s.* FROM sellers s JOIN seller_profiles k ON k.seller_id=s.id WHERE s.user_id=? AND s.status='approved' AND k.kyc_status='verified'").get(user.id);
    if(!seller) return json(res,403,{error:'Approved seller and verified KYC are required to submit listings.'});
    const pid=toInt(body?.productId),sku=clean(body?.sku,60); if(!db.prepare('SELECT id FROM products WHERE id=? AND is_active=1').get(pid)) return json(res,404,{error:'Catalog product not found.'});
    try { const r=db.prepare("INSERT INTO seller_products(seller_id,product_id,seller_sku,status) VALUES(?,?,?,'pending')").run(seller.id,pid,sku); return json(res,201,{id:Number(r.lastInsertRowid),status:'pending'}); } catch { return json(res,409,{error:'This product is already submitted by your store.'}); }
  }
  if(pathname==='/api/admin/notifications/outbox' && method==='GET'){
    if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});
    return json(res,200,{configured:!!process.env.NOTIFICATION_WEBHOOK_URL,counts:db.prepare('SELECT status,COUNT(*) count FROM notification_outbox GROUP BY status').all(),items:db.prepare('SELECT id,event_type,aggregate_id,status,attempts,next_attempt_at,last_error,sent_at,created_at FROM notification_outbox ORDER BY id DESC LIMIT 100').all()});
  }
  if(pathname==='/api/admin/notifications/outbox/retry' && method==='POST'){
    if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});
    const id=toInt(body?.id);const r=db.prepare("UPDATE notification_outbox SET status='pending',attempts=0,next_attempt_at=datetime('now'),locked_at='',last_error='' WHERE id=? AND status IN ('failed','dead')").run(id);
    if(!r.changes)return json(res,409,{error:'Only failed or dead notification events can be retried.'});auditLog(user.id,'notification-retry','outbox',id);return json(res,200,{ok:true});
  }

  if (pathname==='/api/seller/warehouses' && method==='GET') {
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare('SELECT id FROM sellers WHERE user_id=?').get(user.id);if(!seller)return json(res,404,{error:'Seller account not found.'});
    return json(res,200,{warehouses:db.prepare('SELECT * FROM seller_warehouses WHERE seller_id=? ORDER BY is_default DESC,id DESC').all(seller.id)});
  }
  if (pathname==='/api/seller/warehouses' && method==='POST') {
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare("SELECT id FROM sellers WHERE user_id=? AND status='approved'").get(user.id);if(!seller)return json(res,403,{error:'Approved seller required.'});
    const name=clean(body?.name,80),contact=clean(body?.contactName,100),phone=clean(body?.phone,20),a=body?.address||{};
    if(name.length<2||contact.length<2||!/^[0-9+ -]{8,16}$/.test(phone)||!clean(a.line1,160)||!clean(a.city,80)||!clean(a.state,80)||!/^\d{6}$/.test(clean(a.pincode,6)))return json(res,400,{error:'Complete warehouse contact and Indian address details.'});
    const tx=db.transaction(()=>{const hasDefault=!!db.prepare('SELECT id FROM seller_warehouses WHERE seller_id=? AND is_default=1 AND active=1').get(seller.id);const makeDefault=!!body?.isDefault||!hasDefault;if(makeDefault)db.prepare('UPDATE seller_warehouses SET is_default=0 WHERE seller_id=?').run(seller.id);const r=db.prepare('INSERT INTO seller_warehouses(seller_id,name,contact_name,phone,address_json,is_default) VALUES(?,?,?,?,?,?)').run(seller.id,name,contact,phone,JSON.stringify({line1:clean(a.line1,160),line2:clean(a.line2,160),city:clean(a.city,80),state:clean(a.state,80),pincode:clean(a.pincode,6),country:'India'}),makeDefault?1:0);return Number(r.lastInsertRowid);});return json(res,201,{warehouseId:tx()});
  }
  if ((m=pathname.match(/^\/api\/seller\/warehouses\/(\d+)\/inventory$/)) && method==='POST') {
    if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare("SELECT id FROM sellers WHERE user_id=? AND status='approved'").get(user.id);const wid=toInt(m[1]),pid=toInt(body?.productId),qty=toInt(body?.quantity);if(!seller||!db.prepare('SELECT id FROM seller_warehouses WHERE id=? AND seller_id=? AND active=1').get(wid,seller.id)||!db.prepare('SELECT id FROM seller_products WHERE seller_id=? AND product_id=?').get(seller.id,pid)||qty<0||qty>100000)return json(res,400,{error:'Invalid warehouse, product or quantity.'});
    const tx=db.transaction(()=>{const prev=db.prepare('SELECT quantity,reserved FROM warehouse_inventory WHERE warehouse_id=? AND product_id=?').get(wid,pid)||{quantity:0,reserved:0};if(qty<prev.reserved)throw Error('On-hand stock cannot be lower than reserved stock.');const changed=db.prepare('INSERT INTO warehouse_inventory(warehouse_id,product_id,quantity) VALUES(?,?,?) ON CONFLICT(warehouse_id,product_id) DO UPDATE SET quantity=excluded.quantity,updated_at=datetime(\'now\') WHERE excluded.quantity>=warehouse_inventory.reserved').run(wid,pid,qty);if(!changed.changes)throw Error('Stock update conflicts with reserved units.');db.prepare('INSERT INTO inventory_movements(warehouse_id,product_id,delta,reason,actor_user_id) VALUES(?,?,?,\'seller_adjustment\',?)').run(wid,pid,qty-prev.quantity,user.id);});try{tx();return json(res,200,{ok:true});}catch(e){return json(res,409,{error:e.message});}
  }
  if (pathname==='/api/seller/suborders' && method==='GET') {if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare('SELECT id FROM sellers WHERE user_id=?').get(user.id);if(!seller)return json(res,404,{error:'Seller account not found.'});return json(res,200,{suborders:db.prepare('SELECT so.*,o.email,o.payment_status,o.address,sh.shipment_id,sh.awb,sh.label_url,sh.status shipment_status,sh.courier_name FROM seller_suborders so JOIN orders o ON o.id=so.order_id LEFT JOIN seller_shipments sh ON sh.suborder_id=so.id WHERE so.seller_id=? ORDER BY so.id DESC LIMIT 200').all(seller.id)});}

  if (pathname==='/api/seller/disputes' && method==='GET') {if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare('SELECT id FROM sellers WHERE user_id=?').get(user.id);if(!seller)return json(res,404,{error:'Seller account not found.'});return json(res,200,{disputes:db.prepare('SELECT d.*,l.order_id,l.seller_amount FROM seller_disputes d JOIN seller_order_lines l ON l.id=d.order_line_id WHERE d.seller_id=? ORDER BY d.id DESC').all(seller.id)});}
  if (pathname==='/api/seller/disputes' && method==='POST') {if(!user)return json(res,401,{error:'Sign in required.'});const seller=db.prepare("SELECT id FROM sellers WHERE user_id=? AND status='approved'").get(user.id);const line=db.prepare('SELECT id FROM seller_order_lines WHERE id=? AND seller_id=?').get(toInt(body?.orderLineId),seller?.id||0);const reason=clean(body?.reason,80),details=clean(body?.details,1200);if(!seller||!line||reason.length<3||details.length<10)return json(res,400,{error:'Choose one of your order lines and explain the dispute (10+ characters).'});try{const r=db.prepare('INSERT INTO seller_disputes(seller_id,order_line_id,reason,details) VALUES(?,?,?,?)').run(seller.id,line.id,reason,details);return json(res,201,{id:Number(r.lastInsertRowid),status:'open'});}catch{return json(res,409,{error:'A dispute already exists for this order line.'});}}
  if (pathname==='/api/seller/payouts' && method==='POST') {
    if(!user) return json(res,401,{error:'Sign in required.'});
    const seller=db.prepare("SELECT s.id,k.kyc_status,k.bank_status,k.payout_hold FROM sellers s JOIN seller_profiles k ON k.seller_id=s.id WHERE s.user_id=? AND s.status='approved'").get(user.id);
    if(!seller||seller.kyc_status!=='verified'||seller.bank_status!=='verified'||seller.payout_hold) return json(res,403,{error:'Verified KYC and bank account are required. Payouts are currently on hold.'});const providerAccount=db.prepare('SELECT provider_account_id FROM seller_profiles WHERE seller_id=?').get(seller.id)?.provider_account_id;
    const amount=toInt(body?.amount),ledger=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM seller_ledger WHERE seller_id=? AND kind='order_cleared'").get(seller.id).n,committed=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM seller_payouts WHERE seller_id=? AND status IN ('requested','approved','processing','paid')").get(seller.id).n;
    const codCleared=db.prepare("SELECT COALESCE(SUM(l.amount),0) n FROM seller_ledger l JOIN seller_order_lines ol ON ol.id=l.order_line_id JOIN orders o ON o.id=ol.order_id WHERE l.seller_id=? AND l.kind='order_cleared' AND o.payment_method='cod' AND o.payment_status='paid'").get(seller.id).n;
    const routePaid=db.prepare("SELECT COALESCE(SUM(seller_amount-tax_tcs_amount),0) n FROM seller_suborders WHERE seller_id=? AND payout_transfer_id!=''").get(seller.id).n;
    const available=providerAccount?codCleared-committed:ledger-committed-routePaid;
    if(amount<500||amount>available) return json(res,400,{error:providerAccount?'Manual payout is limited to collected COD balance; prepaid orders settle through Razorpay Route.':'Payout must be at least ₹500 and cannot exceed your available cleared balance.',available:Math.max(0,available)});
    const r=db.prepare("INSERT INTO seller_payouts(seller_id,amount) VALUES(?,?)").run(seller.id,amount); return json(res,202,{payoutId:Number(r.lastInsertRowid),status:'requested'});
  }
  if (pathname==='/api/support/chat' && method==='GET') {
    if(!user) return json(res,401,{error:'Sign in to use live concierge chat.'});
    let thread=db.prepare("SELECT * FROM chat_threads WHERE user_id=? AND status='open' ORDER BY id DESC LIMIT 1").get(user.id);
    if(!thread){const r=db.prepare('INSERT INTO chat_threads(user_id) VALUES(?)').run(user.id);thread=db.prepare('SELECT * FROM chat_threads WHERE id=?').get(Number(r.lastInsertRowid));}
    return json(res,200,{thread,messages:db.prepare('SELECT id,sender_type,message,created_at FROM chat_messages WHERE thread_id=? ORDER BY id ASC LIMIT 200').all(thread.id)});
  }
  if (pathname==='/api/support/chat' && method==='POST') {
    if(!user) return json(res,401,{error:'Sign in to use concierge chat.'});if(rateLimited('support-chat:'+user.id,30,60000))return json(res,429,{error:'Please slow down and try again shortly.'}); const msg=clean(body?.message,2000); if(msg.length<1) return json(res,400,{error:'Message is required.'});
    let thread=db.prepare("SELECT * FROM chat_threads WHERE user_id=? AND status='open' ORDER BY id DESC LIMIT 1").get(user.id); if(!thread){const r=db.prepare('INSERT INTO chat_threads(user_id) VALUES(?)').run(user.id);thread={id:Number(r.lastInsertRowid)};}
    const r=db.prepare("INSERT INTO chat_messages(thread_id,sender_type,sender_id,message) VALUES(?,'customer',?,?)").run(thread.id,user.id,msg); db.prepare("UPDATE chat_threads SET updated_at=datetime('now') WHERE id=?").run(thread.id);wsBroadcast(thread.id,{type:'message',threadId:thread.id,message:{id:Number(r.lastInsertRowid),sender_type:'customer',message:msg,created_at:new Date().toISOString()}});
    return json(res,201,{messageId:Number(r.lastInsertRowid),threadId:thread.id,status:'queued_for_agent'});
  }
  if (pathname==='/api/visual-search' && method==='POST') {
    if(rateLimited('visual-search:'+clientIp(req),8,60000))return json(res,429,{error:'Visual search limit reached. Try again shortly.'});
    const d=body?.descriptor||{},imageData=String(body?.imageData||'');let terms=String(d.hint||'').toLowerCase(),mode='colour-and-catalogue-similarity';
    if(imageData){if(!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData)||imageData.length>850000)return json(res,400,{error:'Invalid or oversized visual-search image.'});if(process.env.OPENAI_API_KEY){try{const vr=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.VISION_MODEL||'gpt-4o-mini',temperature:0,response_format:{type:'json_object'},messages:[{role:'system',content:'Describe jewellery/product image for catalogue retrieval. Return JSON with keywords array (max 8), category string, material string, style string. Do not identify people.'},{role:'user',content:[{type:'text',text:'Identify visible product attributes and useful search keywords.'},{type:'image_url',image_url:{url:imageData,detail:'low'}}]}]}),signal:AbortSignal.timeout(25000)});const vd=await vr.json();if(!vr.ok)throw Error();const parsed=JSON.parse(vd.choices?.[0]?.message?.content||'{}');terms=[...(parsed.keywords||[]),parsed.category,parsed.material,parsed.style,d.hint||''].filter(Boolean).join(' ').toLowerCase();mode='multimodal-vision-catalogue-search';}catch{return json(res,502,{error:'AI visual search provider is unavailable. Retry or use keyword search.'});}}}
    const rgb=['r','g','b'].map(k=>Number(d[k]));if(mode!=='multimodal-vision-catalogue-search'&&rgb.some(x=>!Number.isFinite(x)||x<0||x>255))return json(res,400,{error:'A valid image or colour descriptor is required.'});
    if(user)db.prepare('INSERT INTO visual_search_events(user_id,descriptor_json) VALUES(?,?)').run(user.id,JSON.stringify({mode,terms:terms.slice(0,500)}));
    const rows=db.prepare('SELECT * FROM products WHERE is_active=1 ORDER BY rating DESC,review_count DESC LIMIT 100').all();const words=terms.split(/[^a-z0-9]+/).filter(x=>x.length>2).slice(0,12);
    const score=p=>{const text=(p.name+' '+p.description+' '+p.category_slug+' '+p.purity).toLowerCase();const lexical=words.reduce((n,w)=>n+(text.includes(w)?8:0),0);const colour=mode==='multimodal-vision-catalogue-search'?0:Math.max(0,20-Math.abs((rgb[0]+rgb[1]+rgb[2])/3-170)/8);return lexical+colour+Number(p.rating||0)*1.5;};
    return json(res,200,{mode,aiVision:mode==='multimodal-vision-catalogue-search',products:rows.sort((a,b)=>score(b)-score(a)).slice(0,16).map(productRow),notice:mode==='multimodal-vision-catalogue-search'?'AI vision extracted product attributes and matched them against the catalogue.':'Fallback mode: local colour signature plus catalogue metadata; configure OPENAI_API_KEY and VISION_MODEL for AI vision.'});
  }
  if(pathname==='/api/admin/marketplace/suborders/release' && method==='POST'){if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});const result=await executeRouteTransfer(toInt(body?.suborderId),user.id);if(!result.ok)return json(res,result.unknown?502:409,{error:result.error});return json(res,result.alreadyReleased?200:202,result); }

  if(pathname==='/api/admin/marketplace/tax-settings' && method==='GET'){if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});return json(res,200,{settings:db.prepare('SELECT * FROM marketplace_tax_settings WHERE id=1').get()});}
  if(pathname==='/api/admin/marketplace/tax-settings' && method==='PUT'){if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});const gstin=clean(body?.operatorGstin,15).toUpperCase(),intra=Number(body?.tcsIntraRate),inter=Number(body?.tcsInterRate);if(gstin&&!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin))return json(res,400,{error:'Invalid GSTIN format.'});if(!Number.isFinite(intra)||!Number.isFinite(inter)||intra<0||inter<0||intra>1||inter>1)return json(res,400,{error:'TCS rate must be 0–1 percent. Confirm applicable rate with your CA.'});if(body?.enabled&&(!gstin||(!intra&&!inter)))return json(res,400,{error:'GSTIN and CA-confirmed non-zero TCS rates are required before enabling the tax ledger.'});db.prepare("UPDATE marketplace_tax_settings SET operator_gstin=?,tcs_intra_rate=?,tcs_inter_rate=?,enabled=?,reviewed_by=?,updated_at=datetime('now') WHERE id=1").run(gstin,intra,inter,body?.enabled?1:0,clean(user.email,254));auditLog(user.id,'update','marketplace_tax_settings','1',{enabled:!!body?.enabled});return json(res,200,{ok:true});}
  if(pathname==='/api/admin/marketplace/tax-report' && method==='GET'){if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});const period=clean(query.get('period')||new Date().toISOString().slice(0,7),7);if(!/^\d{4}-\d{2}$/.test(period))return json(res,400,{error:'Period must be YYYY-MM.'});const rows=db.prepare("SELECT l.*,s.name AS seller_name,'accrual' AS entry_type FROM marketplace_tax_ledger l JOIN sellers s ON s.id=l.seller_id WHERE substr(l.created_at,1,7)=? UNION ALL SELECT a.id,0,a.seller_id,NULL,'',a.taxable_adjustment,0,a.tcs_adjustment,'return_adjustment','return_adjustment',a.created_at,s.name,'return' FROM marketplace_tax_adjustments a JOIN sellers s ON s.id=a.seller_id WHERE substr(a.created_at,1,7)=? ORDER BY created_at").all(period,period);return json(res,200,{period,rows,summary:{taxableValue:rows.reduce((n,r)=>n+r.taxable_value,0),tcs:rows.reduce((n,r)=>n+r.tcs_amount,0),count:rows.length},disclaimer:'Working reconciliation only. Verify legal applicability, adjustments and GSTR-8 with your CA before filing.'});}
  if(pathname==='/api/admin/marketplace/tax-report.csv' && method==='GET'){if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});const period=clean(query.get('period')||new Date().toISOString().slice(0,7),7);const rows=db.prepare("SELECT l.order_id,s.name,l.state_of_supply,l.taxable_value,l.tcs_rate,l.tcs_amount,l.tax_type,l.status,l.created_at FROM marketplace_tax_ledger l JOIN sellers s ON s.id=l.seller_id WHERE substr(l.created_at,1,7)=? UNION ALL SELECT a.return_id,s.name,'',a.taxable_adjustment,0,a.tcs_adjustment,'','return_adjustment',a.created_at FROM marketplace_tax_adjustments a JOIN sellers s ON s.id=a.seller_id WHERE substr(a.created_at,1,7)=? ORDER BY 9").all(period,period);const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const csv=['order_id,seller,state_of_supply,taxable_value,tcs_rate,tcs_amount,tax_type,status,created_at',...rows.map(r=>[r.order_id,r.name,r.state_of_supply,r.taxable_value,r.tcs_rate,r.tcs_amount,r.tax_type,r.status,r.created_at].map(q).join(','))].join('\n');res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="chandrahasa-tcs-${period}.csv"`,'Cache-Control':'no-store'});return res.end(csv);}
  if(pathname==='/api/admin/marketplace/suborders' && method==='GET'){if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});return json(res,200,{routeEnabled:process.env.RAZORPAY_ROUTE_ENABLED==='true',suborders:db.prepare('SELECT so.*,s.name AS seller_name,k.provider_account_id,o.payment_status,o.payment_id,o.status AS order_status FROM seller_suborders so JOIN sellers s ON s.id=so.seller_id JOIN seller_profiles k ON k.seller_id=s.id JOIN orders o ON o.id=so.order_id ORDER BY so.id DESC LIMIT 300').all()});}

  if (pathname==='/api/admin/seller-disputes' && method==='GET') {if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});return json(res,200,{disputes:db.prepare('SELECT d.*,s.name AS seller_name,l.order_id,l.seller_amount FROM seller_disputes d JOIN sellers s ON s.id=d.seller_id JOIN seller_order_lines l ON l.id=d.order_line_id ORDER BY d.id DESC').all()});}
  if (pathname==='/api/admin/seller-disputes/status' && method==='POST') {if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});const status=clean(body?.status,20);if(!['under_review','resolved','rejected'].includes(status))return json(res,400,{error:'Invalid dispute status.'});db.prepare("UPDATE seller_disputes SET status=?,resolution=?,updated_at=datetime('now') WHERE id=?").run(status,clean(body?.resolution,1000),toInt(body?.id));return json(res,200,{ok:true});}
  if (pathname==='/api/admin/seller-payouts' && method==='GET') {
    if(!user||user.role!=='admin') return json(res,403,{error:'Admin access only.'});
    return json(res,200,{payouts:db.prepare('SELECT p.*,s.name AS seller_name FROM seller_payouts p JOIN sellers s ON s.id=p.seller_id ORDER BY p.id DESC LIMIT 200').all()});
  }
  if (pathname==='/api/admin/seller-payouts/status' && method==='POST') {
    if(!user||user.role!=='admin') return json(res,403,{error:'Admin access only.'}); const id=toInt(body?.id),status=clean(body?.status,20),ref=clean(body?.reference,100);
    if(!['approved','processing','paid','rejected'].includes(status)) return json(res,400,{error:'Invalid payout state.'});
    const p=db.prepare('SELECT * FROM seller_payouts WHERE id=?').get(id); if(!p) return json(res,404,{error:'Payout not found.'}); if(p.status==='paid')return status==='paid'?json(res,200,{ok:true,alreadyPaid:true}):json(res,409,{error:'A paid payout cannot be changed.'});
    if(status==='paid'&&!ref) return json(res,400,{error:'A verified bank transfer reference is required before marking paid.'});
    db.prepare("UPDATE seller_payouts SET status=?,reference=?,admin_note=?,updated_at=datetime('now') WHERE id=?").run(status,ref,clean(body?.note,500),id);
    if(status==='paid') db.prepare("INSERT INTO seller_ledger(seller_id,payout_id,amount,kind) VALUES(?,?,?,'payout')").run(p.seller_id,id,-p.amount);
    return json(res,200,{ok:true,status});
  }

  /* ── CUSTOMER EXPERIENCE / MARKETPLACE ─────────────────── */
  if (pathname === '/api/addresses' && method === 'GET') {
    if (!user) return json(res,401,{error:'Sign in to manage saved addresses.'});
    return json(res,200,{addresses:db.prepare('SELECT * FROM customer_addresses WHERE user_id=? ORDER BY is_default DESC,id DESC').all(user.id)});
  }
  if (pathname === '/api/addresses' && method === 'POST') {
    if (!user) return json(res,401,{error:'Sign in to save an address.'});
    const a=body||{}; const fields=['name','phone','line1','city','state','pincode'];
    if(fields.some(k=>!clean(a[k],180)) || !/^\d{6}$/.test(String(a.pincode||''))) return json(res,400,{error:'Enter name, phone, address, city, state and a valid 6-digit PIN.'});
    const tx=db.transaction(()=>{ if(a.is_default) db.prepare('UPDATE customer_addresses SET is_default=0 WHERE user_id=?').run(user.id); const r=db.prepare(`INSERT INTO customer_addresses(user_id,label,name,phone,line1,line2,city,state,pincode,is_default) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(user.id,clean(a.label||'Home',30),clean(a.name,100),clean(a.phone,20),clean(a.line1,250),clean(a.line2,250),clean(a.city,100),clean(a.state,100),String(a.pincode),a.is_default?1:0); return Number(r.lastInsertRowid); });
    return json(res,201,{id:tx()});
  }
  if ((m=pathname.match(/^\/api\/addresses\/(\d+)\/default$/)) && method==='POST') { if(!user) return json(res,401,{error:'Sign in required.'}); const tx=db.transaction(()=>{const a=db.prepare('SELECT id FROM customer_addresses WHERE id=? AND user_id=?').get(toInt(m[1]),user.id);if(!a)return false;db.prepare('UPDATE customer_addresses SET is_default=0 WHERE user_id=?').run(user.id);db.prepare('UPDATE customer_addresses SET is_default=1 WHERE id=? AND user_id=?').run(a.id,user.id);return true;});return tx()?json(res,200,{ok:true}):json(res,404,{error:'Address not found.'}); }
  if ((m=pathname.match(/^\/api\/addresses\/(\d+)$/)) && method==='DELETE') {
    if(!user) return json(res,401,{error:'Sign in required.'}); db.prepare('DELETE FROM customer_addresses WHERE id=? AND user_id=?').run(toInt(m[1]),user.id); return json(res,200,{ok:true});
  }
  if (pathname==='/api/returns' && method==='GET') {
    if(!user) return json(res,401,{error:'Sign in to view return requests.'}); return json(res,200,{returns:db.prepare('SELECT * FROM return_requests WHERE user_id=? ORDER BY id DESC').all(user.id)});
  }
  if (pathname==='/api/returns' && method==='POST') {
    if(!user) return json(res,401,{error:'Sign in to request a return.'}); const oid=toInt(body?.orderId); const o=db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(oid,user.id);
    if(!o) return json(res,404,{error:'Order not found in your account.'}); if(o.status!=='delivered') return json(res,409,{error:'Returns can be requested after delivery. Contact support for damaged/incorrect parcel exceptions.'});
    if(db.prepare("SELECT id FROM return_requests WHERE order_id=? AND status NOT IN ('rejected','closed')").get(oid)) return json(res,409,{error:'A return request already exists for this order.'});
    const reason=clean(body?.reason,100),details=clean(body?.details,1000);if(reason.length<3)return json(res,400,{error:'Select or enter a return reason.'});
    const r=db.prepare('INSERT INTO return_requests(order_id,user_id,reason,details) VALUES(?,?,?,?)').run(oid,user.id,reason,details);enqueueNotification('return.requested',String(r.lastInsertRowid),{returnId:Number(r.lastInsertRowid),orderId:oid,reason});return json(res,201,{id:Number(r.lastInsertRowid),status:'requested'});
  }
  if (pathname==='/api/questions' && method==='GET') { const pid=toInt(query.get('productId')); return json(res,200,{questions:db.prepare("SELECT q.id,q.question,q.answer,q.created_at,u.name AS asker FROM product_questions q LEFT JOIN users u ON u.id=q.user_id WHERE q.product_id=? AND q.status='answered' ORDER BY q.id DESC").all(pid)}); }
  if (pathname==='/api/questions' && method==='POST') { if(!user) return json(res,401,{error:'Sign in to ask a product question.'}); const pid=toInt(body?.productId),q=clean(body?.question,700); if(!db.prepare('SELECT id FROM products WHERE id=? AND is_active=1').get(pid)||q.length<8) return json(res,400,{error:'Choose a product and enter a question (8+ characters).'}); const r=db.prepare('INSERT INTO product_questions(product_id,user_id,question) VALUES(?,?,?)').run(pid,user.id,q); return json(res,201,{id:Number(r.lastInsertRowid),status:'pending'}); }
  if (pathname==='/api/compare' && method==='GET') { const ids=(query.get('ids')||'').split(',').map(x=>toInt(x)).filter(Boolean).slice(0,4); if(!ids.length)return json(res,200,{products:[]}); const rows=db.prepare(`SELECT id,slug,name,category_slug,description,price,compare_price,images,huid,purity,weight,stock,rating,review_count FROM products WHERE id IN (${ids.map(()=>'?').join(',')}) AND is_active=1 AND ${PUBLIC_CATALOG_FILTER}`).all(...ids).map(productRow); return json(res,200,{products:rows}); }
  if (pathname==='/api/recommendations' && method==='GET') { const pid=toInt(query.get('productId')); const p=db.prepare('SELECT * FROM products WHERE id=?').get(pid); const recent=user?db.prepare('SELECT query FROM search_events WHERE user_id=? ORDER BY id DESC LIMIT 12').all(user.id):[]; const terms=recent.map(x=>x.query.toLowerCase()); const rows=db.prepare('SELECT * FROM products WHERE is_active=1 AND ${PUBLIC_CATALOG_FILTER} AND id<>? ORDER BY rating DESC,review_count DESC LIMIT 100').all(pid||0); const base=p?db.prepare('SELECT embedding_json FROM product_embeddings WHERE product_id=?').get(pid):null; if(base){const v=JSON.parse(base.embedding_json);const ranked=rows.map(x=>{const e=db.prepare('SELECT embedding_json FROM product_embeddings WHERE product_id=?').get(x.id);return {...x,_score:(e?cosineSimilarity(v,JSON.parse(e.embedding_json)):0)*100+Number(x.rating||0)*0.25};}).sort((a,b)=>b._score-a._score).slice(0,8);return json(res,200,{mode:'semantic-vector+quality',aiEmbedding:true,products:ranked.map(productRow)});} const pcat=p?.category_slug; const ranked=rows.map(x=>({...x,_score:(pcat&&x.category_slug===pcat?8:0)+Number(x.rating||0)*2+Math.min(5,Number(x.review_count||0)/10)+(terms.some(t=>(x.name+' '+x.description+' '+x.category_slug).toLowerCase().includes(t))?6:0)})).sort((a,b)=>b._score-a._score).slice(0,8); return json(res,200,{mode:'hybrid-catalogue-personalization',aiEmbedding:false,products:ranked.map(productRow)}); }
  if (pathname==='/api/semantic-search' && method==='GET') {
    if(rateLimited('semantic-search:'+clientIp(req),20,60000))return json(res,429,{error:'Search limit reached. Try again shortly.'});
    const q=clean(query.get('q'),300);if(q.length<3)return json(res,200,{products:[],mode:'semantic'});
    if(!process.env.OPENAI_API_KEY)return json(res,503,{error:'Semantic search is not configured. Set OPENAI_API_KEY and build product embeddings.'});
    try{const vector=await createEmbedding(q),rows=db.prepare('SELECT p.*,e.embedding_json FROM product_embeddings e JOIN products p ON p.id=e.product_id WHERE p.is_active=1').all();const ranked=rows.map(x=>({...x,_score:cosineSimilarity(vector,JSON.parse(x.embedding_json))})).sort((a,b)=>b._score-a._score).slice(0,20);if(user)db.prepare('INSERT INTO search_events(user_id,query) VALUES(?,?)').run(user.id,q);return json(res,200,{mode:'semantic-vector',products:ranked.map(productRow)});}catch{return json(res,502,{error:'Semantic search provider is temporarily unavailable.'});}
  }
  if (pathname==='/api/search' && method==='GET') { const q=clean(query.get('q'),100); if(q.length<2)return json(res,200,{products:[]}); if(user)db.prepare('INSERT INTO search_events(user_id,query) VALUES(?,?)').run(user.id,q); const like='%'+q.replace(/[\\%_]/g,'')+'%'; const rows=db.prepare('SELECT * FROM products WHERE is_active=1 AND ${PUBLIC_CATALOG_FILTER} AND (name LIKE ? OR description LIKE ? OR category_slug LIKE ?) ORDER BY rating DESC LIMIT 20').all(like,like,like); return json(res,200,{products:rows.map(productRow)}); }
  if (pathname==='/api/gift-cards/check' && method==='POST') { if(rateLimited('gift-check:'+clientIp(req),12,60000))return json(res,429,{error:'Too many gift card checks. Try again shortly.'}); const code=clean(body?.code,32).toUpperCase(); const g=db.prepare("SELECT code,balance,active,expires_at FROM gift_cards WHERE code=?").get(code); if(!g||!g.active||(g.expires_at&&new Date(g.expires_at)<new Date()))return json(res,404,{error:'Gift card not found or expired.'}); return json(res,200,{code:g.code,balance:g.balance}); }
  if (pathname==='/api/loyalty' && method==='GET') { if(!user)return json(res,401,{error:'Sign in to view rewards.'}); const rows=db.prepare('SELECT points,reason,order_id,created_at FROM loyalty_ledger WHERE user_id=? ORDER BY id DESC LIMIT 50').all(user.id); return json(res,200,{points:rows.reduce((n,r)=>n+r.points,0),history:rows,earnRate:'1 point per ₹100 on eligible delivered orders'}); }
  if (pathname==='/api/support/tickets' && method==='GET') { if(!user)return json(res,401,{error:'Sign in to view support tickets.'}); return json(res,200,{tickets:db.prepare('SELECT id,subject,message,status,created_at FROM support_tickets WHERE user_id=? ORDER BY id DESC').all(user.id)}); }
  if (pathname==='/api/support/tickets' && method==='POST') { const email=clean(body?.email||user?.email,254).toLowerCase(),subject=clean(body?.subject,120),message=clean(body?.message,2000); if(!validEmail(email)||subject.length<3||message.length<10)return json(res,400,{error:'Enter a valid email, subject and message (10+ characters).'}); const r=db.prepare('INSERT INTO support_tickets(user_id,email,subject,message) VALUES(?,?,?,?)').run(user?.id||null,email,subject,message); return json(res,201,{ticketId:Number(r.lastInsertRowid),status:'open'}); }
  if (pathname==='/api/sellers/apply' && method==='POST') { if(!user)return json(res,401,{error:'Create an account before applying as a seller.'}); const name=clean(body?.name,100),slug=clean(body?.slug,80).toLowerCase().replace(/[^a-z0-9-]/g,'-'); if(name.length<2||slug.length<3)return json(res,400,{error:'Enter a seller name and unique store slug.'}); try{const r=db.prepare('INSERT INTO sellers(user_id,name,slug) VALUES(?,?,?)').run(user.id,name,slug);return json(res,201,{sellerId:Number(r.lastInsertRowid),status:'pending',message:'Application received. Admin approval required before listings go live.'});}catch{return json(res,409,{error:'That seller slug is already in use.'});} }

  // Public, read-only storefront theme subset. Private admin settings never leave the server.
  if (pathname === '/api/storefront/customizations' && method === 'GET') {
    const allowed = ['customization.theme.primary','customization.theme.accent','customization.theme.background','customization.theme.surface','customization.theme.text','customization.theme.muted','customization.theme.radius','customization.store.announcement'];
    const rows = db.prepare('SELECT key,value FROM store_settings WHERE key IN (' + allowed.map(()=>'?').join(',') + ')').all(...allowed);
    const values = Object.fromEntries(rows.map(row => { try { return [row.key, JSON.parse(row.value)]; } catch { return [row.key, null]; } }));
    return json(res, 200, { customizations: values });
  }

  // Admin entry discovery reveals only whether the first owner has been provisioned.
  if (pathname === '/api/admin/access/status' && method === 'GET') {
    const totalUsers = Number(db.prepare('SELECT COUNT(*) count FROM users').get().count);
    const admins = Number(db.prepare("SELECT COUNT(*) count FROM users WHERE role='admin'").get().count);
    return json(res, 200, { hasAdmin: admins > 0, canBootstrap: totalUsers === 0, setupAvailable: admins === 0 && totalUsers === 0 });
  }

  /* ════════ ADMIN (RBAC: role = admin) ════════ */
  if (pathname.startsWith('/api/admin')) {
    if (!user || user.role !== 'admin') return json(res, 403, { error: 'Admin access only.' });

    if (pathname === '/api/admin/media' && method === 'GET') {
      const uploadDir = path.join(path.dirname(process.env.DATA_PATH || path.join(__dirname,'data','chandrahasa.db')), 'uploads');
      fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
      const media = fs.readdirSync(uploadDir).filter(name => /^[a-f0-9]{36}\.(?:jpg|png|webp|gif)$/.test(name)).map(name => {
        const file = path.join(uploadDir,name), stat = fs.statSync(file);
        return { name, url:'/uploads/'+name, bytes:stat.size, createdAt:stat.mtime.toISOString() };
      }).sort((x,y)=>y.createdAt.localeCompare(x.createdAt));
      return json(res,200,{media});
    }
    if (pathname === '/api/admin/media' && method === 'POST') {
      if (rateLimited('media-upload:' + user.id, 60, 60 * 60 * 1000)) return json(res, 429, { error: 'Upload limit reached. Try again later.' });
      const dataUrl = String(body?.dataUrl || '');
      const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return json(res, 400, { error: 'Upload a JPEG, PNG, WebP or GIF image. SVG and other file types are not accepted.' });
      const buffer = Buffer.from(match[2], 'base64');
      if (!buffer.length || buffer.length > 8 * 1024 * 1024) return json(res, 413, { error: 'Image must be 8 MB or smaller.' });
      const mime = match[1];
      const valid = mime === 'image/png' ? buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
        : mime === 'image/jpeg' ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length-2] === 0xff && buffer[buffer.length-1] === 0xd9
        : mime === 'image/gif' ? ['GIF87a','GIF89a'].includes(buffer.subarray(0,6).toString('ascii'))
        : buffer.subarray(0,4).toString('ascii') === 'RIFF' && buffer.subarray(8,12).toString('ascii') === 'WEBP';
      if (!valid) return json(res, 400, { error: 'Image file signature does not match its declared type.' });
      const uploadDir = path.join(path.dirname(process.env.DATA_PATH || path.join(__dirname,'data','chandrahasa.db')), 'uploads');
      fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
      const ext = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[mime];
      const filename = crypto.randomBytes(18).toString('hex') + '.' + ext;
      const target = path.join(uploadDir, filename);
      fs.writeFileSync(target, buffer, { flag: 'wx', mode: 0o640 });
      auditLog(user.id, 'media_upload', 'media', filename, { mime, bytes: buffer.length });
      return json(res, 201, { ok: true, url: '/uploads/' + filename, mime, bytes: buffer.length });
    }

    if(pathname==='/api/admin/support/chat' && method==='GET') return json(res,200,{threads:db.prepare('SELECT t.*,u.name,u.email,(SELECT message FROM chat_messages m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) AS last_message FROM chat_threads t JOIN users u ON u.id=t.user_id ORDER BY t.updated_at DESC LIMIT 200').all()});
    if(pathname==='/api/admin/support/chat/reply' && method==='POST'){const id=toInt(body?.threadId),message=clean(body?.message,2000);if(message.length<1)return json(res,400,{error:'Reply message is required.'});const t=db.prepare('SELECT id FROM chat_threads WHERE id=?').get(id);if(!t)return json(res,404,{error:'Chat thread not found.'});const r=db.prepare("INSERT INTO chat_messages(thread_id,sender_type,sender_id,message) VALUES(?,'agent',?,?)").run(id,user.id,message);db.prepare("UPDATE chat_threads SET updated_at=datetime('now') WHERE id=?").run(id);wsBroadcast(id,{type:'message',threadId:id,message:{id:Number(r.lastInsertRowid),sender_type:'agent',message,created_at:new Date().toISOString()}});return json(res,201,{messageId:Number(r.lastInsertRowid)});}
    if(pathname==='/api/admin/returns' && method==='GET') return json(res,200,{returns:db.prepare('SELECT r.*,o.total,o.email,o.payment_method,o.payment_status,(SELECT id FROM refunds WHERE order_id=r.order_id ORDER BY id DESC LIMIT 1) AS refund_local_id FROM return_requests r JOIN orders o ON o.id=r.order_id ORDER BY r.id DESC LIMIT 200').all()});
    if(pathname==='/api/admin/returns/status' && method==='POST'){
      const id=toInt(body?.id),status=clean(body?.status,20);
      if(!['approved','rejected','received','refunded','closed'].includes(status))return json(res,400,{error:'Invalid return status.'});
      const tx=db.transaction(()=>{
        const r=db.prepare('SELECT * FROM return_requests WHERE id=?').get(id);if(!r)throw Error('Return not found');
        const transitions={requested:['approved','rejected'],approved:['received','rejected'],received:['refunded','closed'],refunded:['closed'],rejected:[],closed:[]};
        if(r.status===status)return {unchanged:true,orderId:r.order_id};
        if(!(transitions[r.status]||[]).includes(status))throw Error(`Invalid return transition: ${r.status} → ${status}`);
        const order=db.prepare('SELECT * FROM orders WHERE id=?').get(r.order_id);if(!order)throw Error('Order not found');
        if(status==='refunded'&&order.payment_id&&order.payment_method!=='cod'){
          const paid=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE order_id=? AND status IN ('paid','refund_pending','refunded')").get(order.id).n;
          const refunded=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM refunds WHERE order_id=? AND status='processed'").get(order.id).n;
          if(refunded<paid)throw Error('Full captured online payment must be reconciled as refunded before closing this return.');
        }
        if(status==='refunded'&&order.payment_method==='cod'){
          const reference=clean(body?.refundReference,100);if(reference.length<6)throw Error('COD refund requires a bank transfer reference (6+ characters).');
          db.prepare("INSERT INTO return_fulfilment(return_id,provider,refund_reference,refund_status) VALUES(?,'manual_bank_transfer',?,'processed') ON CONFLICT(return_id) DO UPDATE SET provider='manual_bank_transfer',refund_reference=excluded.refund_reference,refund_status='processed',updated_at=datetime('now')").run(id,reference);
        }
        db.prepare("UPDATE return_requests SET status=?,updated_at=datetime('now') WHERE id=?").run(status,id);
        if(status==='received'&&order.status==='delivered')db.prepare("UPDATE orders SET status='returned' WHERE id=? AND status='delivered'").run(order.id);
        if(status==='received'){
          if(order.user_id){
            const earned=db.prepare("SELECT points FROM loyalty_ledger WHERE order_id=? AND reason='delivered_order'").get(order.id);
            if(earned&&!db.prepare("SELECT id FROM loyalty_ledger WHERE order_id=? AND reason='return_clawback'").get(order.id))db.prepare("INSERT INTO loyalty_ledger(user_id,points,reason,order_id) VALUES(?,?,'return_clawback',?)").run(order.user_id,-Math.abs(earned.points),order.id);
            const redemption=db.prepare('SELECT points FROM loyalty_redemptions WHERE order_id=?').get(order.id);
            if(redemption&&!db.prepare("SELECT id FROM loyalty_ledger WHERE order_id=? AND reason='return_restore'").get(order.id))db.prepare("INSERT INTO loyalty_ledger(user_id,points,reason,order_id) VALUES(?,?,'return_restore',?)").run(order.user_id,redemption.points,order.id);
          }
          const gc=db.prepare('SELECT code,amount FROM gift_card_redemptions WHERE order_id=?').get(order.id);
          if(gc&&!db.prepare("SELECT id FROM gift_card_ledger WHERE order_id=? AND kind='refund'").get(order.id)){
            db.prepare('UPDATE gift_cards SET balance=balance+? WHERE code=?').run(gc.amount,gc.code);
            db.prepare("INSERT INTO gift_card_ledger(code,order_id,amount,kind) VALUES(?,?,?,'refund')").run(gc.code,order.id,gc.amount);
          }
          db.prepare("UPDATE seller_suborders SET status='returned',updated_at=datetime('now') WHERE order_id=? AND status!='paid'").run(order.id);
          db.prepare("UPDATE seller_order_lines SET status='returned' WHERE order_id=?").run(order.id);
          db.prepare("UPDATE seller_ledger SET kind='returned' WHERE order_line_id IN (SELECT id FROM seller_order_lines WHERE order_id=?) AND kind='order_cleared'").run(order.id);
          const taxRows=db.prepare('SELECT seller_id,taxable_value,tcs_amount FROM marketplace_tax_ledger WHERE order_id=?').all(order.id);
          for(const tr of taxRows)db.prepare('INSERT OR IGNORE INTO marketplace_tax_adjustments(return_id,seller_id,taxable_adjustment,tcs_adjustment) VALUES(?,?,?,?)').run(r.id,tr.seller_id,-Math.abs(tr.taxable_value),-Math.abs(tr.tcs_amount));
        }
        return {unchanged:false,orderId:r.order_id};
      });
      try{const result=tx();if(!result.unchanged)enqueueNotification('return.status_changed',`${id}:${status}`,{returnId:id,orderId:result.orderId,status});return json(res,200,{ok:true,unchanged:!!result.unchanged});}
      catch(e){return json(res,409,{error:e.message||'Return update failed'});}
    }
    if(pathname==='/api/admin/returns/reverse-pickup' && method==='POST'){
      if(!process.env.SHIPROCKET_EMAIL||!process.env.SHIPROCKET_PASSWORD)return json(res,503,{error:'Shiprocket credentials are not configured.'});
      const rid=toInt(body?.returnId),ret=db.prepare("SELECT r.*,o.id AS oid,o.email,o.phone,o.address,o.subtotal,o.shipping,o.payment_method FROM return_requests r JOIN orders o ON o.id=r.order_id WHERE r.id=? AND r.status='approved'").get(rid);
      if(!ret)return json(res,409,{error:'Only an approved return can request reverse pickup.'});
      let reservation=db.prepare("INSERT OR IGNORE INTO return_fulfilment(return_id,provider,pickup_status) VALUES(?,'Shiprocket','creating')").run(rid);
      const state=db.prepare('SELECT * FROM return_fulfilment WHERE return_id=?').get(rid);if(!reservation.changes&&state.pickup_reference)return json(res,200,{ok:true,alreadyCreated:true,reference:state.pickup_reference});if(!reservation.changes&&state.pickup_status==='creating')return json(res,409,{error:'Reverse pickup is already being created. Reconcile with Shiprocket before retrying.'});
      try{const login=await fetch('https://apiv2.shiprocket.in/v1/external/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.SHIPROCKET_EMAIL,password:process.env.SHIPROCKET_PASSWORD}),signal:AbortSignal.timeout(12000)});const ld=await login.json();if(!login.ok||!ld.token)throw Error('Shiprocket login failed');
        const a=JSON.parse(ret.address||'{}'),items=db.prepare('SELECT oi.name,oi.price,oi.qty,p.weight FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?').all(ret.oid);const weight=items.reduce((n,x)=>n+(Math.max(.1,parseFloat(String(x.weight||'').replace(/[^0-9.]/g,''))||250)/1000)*x.qty,0);
        const payload={order_id:`CH-RET-${rid}`,order_date:new Date().toISOString().slice(0,10),pickup_customer_name:a.name||'Customer',pickup_address:a.line1||'',pickup_address_2:a.line2||'',pickup_city:a.city||'',pickup_state:a.state||'',pickup_pincode:a.pincode||'',pickup_country:'India',pickup_email:ret.email,pickup_phone:ret.phone,shipping_is_billing:true,order_items:items.map(x=>({name:x.name,sku:`CH-${ret.oid}`,units:x.qty,selling_price:x.price})),payment_method:'Prepaid',sub_total:ret.subtotal,order_weight:Math.max(.1,Number(weight.toFixed(3))),length:15,breadth:15,height:8};
        const sr=await fetch('https://apiv2.shiprocket.in/v1/external/orders/create/return',{method:'POST',headers:{Authorization:`Bearer ${ld.token}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});const sd=await sr.json();if(!sr.ok||(!sd.order_id&&!sd.shipment_id))throw Error(sd.message||'Return order creation failed');const ref=String(sd.shipment_id||sd.order_id);db.prepare("UPDATE return_fulfilment SET pickup_reference=?,pickup_status='created',updated_at=datetime('now') WHERE return_id=?").run(ref,rid);auditLog(user.id,'reverse-pickup','return',rid,{provider:'Shiprocket',reference:ref});return json(res,202,{ok:true,reference:ref,provider:'Shiprocket',message:'Reverse pickup order created. Courier/AWB assignment may still be pending.'});
      }catch{db.prepare("UPDATE return_fulfilment SET pickup_status='unknown',updated_at=datetime('now') WHERE return_id=?").run(rid);return json(res,502,{error:'Reverse pickup outcome is unknown. Reconcile CH-RET-'+rid+' in Shiprocket before retrying.'});}
    }
    if(pathname==='/api/admin/returns/refund' && method==='POST'){
      const rid=toInt(body?.returnId),ret=db.prepare("SELECT r.*,o.id AS oid,o.payment_status,o.payment_id,o.total FROM return_requests r JOIN orders o ON o.id=r.order_id WHERE r.id=? AND r.status='received'").get(rid);
      if(!ret)return json(res,409,{error:'Returned parcel must be marked received before refund.'});if(db.prepare("SELECT id FROM seller_suborders WHERE order_id=? AND payout_transfer_id!='' LIMIT 1").get(ret.oid))return json(res,409,{error:'A seller Route transfer exists. Reverse/reconcile the seller transfer in Razorpay Route before issuing the customer refund.'});if(ret.payment_method==='cod'||ret.payment_status!=='paid'||!ret.payment_id)return json(res,409,{error:'This automated refund route is only for captured Razorpay payments. COD refunds must be sent by verified bank transfer and recorded with the UTR/reference.'});
      if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)return json(res,503,{error:'Razorpay credentials are not configured.'});
      const reserve=db.transaction(()=>{const paid=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE order_id=? AND payment_id=? AND status IN ('paid','refund_pending')").get(ret.oid,ret.payment_id).n;const used=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM refunds WHERE order_id=? AND payment_id=? AND status NOT IN ('failed','rejected')").get(ret.oid,ret.payment_id).n;const amount=paid-used;if(amount<=0)return null;const r=db.prepare("INSERT INTO refunds(order_id,payment_id,amount,status) VALUES(?,?,?,'initiating')").run(ret.oid,ret.payment_id,amount);return{id:Number(r.lastInsertRowid),amount};});const r=reserve();if(!r)return json(res,409,{error:'No refundable balance remains.'});
      try{const auth=Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');const rr=await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(ret.payment_id)}/refund`,{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/json'},body:JSON.stringify({amount:r.amount*100,receipt:`CH-RETURN-${rid}-${r.id}`}),signal:AbortSignal.timeout(15000)});const rd=await rr.json();if(!rr.ok||!rd.id)throw Error();db.prepare('UPDATE refunds SET gateway_refund_id=?,status=? WHERE id=?').run(rd.id,rd.status||'pending',r.id);db.prepare("UPDATE return_fulfilment SET refund_reference=?,refund_status='initiated',updated_at=datetime('now') WHERE return_id=?").run(rd.id,rid);auditLog(user.id,'return-refund','return',rid,{refund_id:rd.id,amount:r.amount});return json(res,202,{ok:true,refundId:rd.id,status:rd.status||'pending',amount:r.amount});}catch{db.prepare("UPDATE refunds SET status='unknown' WHERE id=?").run(r.id);db.prepare("UPDATE return_fulfilment SET refund_status='unknown',updated_at=datetime('now') WHERE return_id=?").run(rid);return json(res,502,{error:'Refund result is unknown. Reconcile in Razorpay before retrying.'});}
    }

    if(pathname==='/api/admin/questions' && method==='GET') return json(res,200,{questions:db.prepare('SELECT q.*,p.name AS product_name FROM product_questions q JOIN products p ON p.id=q.product_id ORDER BY q.id DESC LIMIT 200').all()});
    if(pathname==='/api/admin/questions/answer' && method==='POST'){db.prepare("UPDATE product_questions SET answer=?,status='answered' WHERE id=?").run(clean(body?.answer,1000),toInt(body?.id));return json(res,200,{ok:true});}
    if(pathname==='/api/admin/tickets' && method==='GET') return json(res,200,{tickets:db.prepare('SELECT * FROM support_tickets ORDER BY id DESC LIMIT 200').all()});
    if(pathname==='/api/admin/sellers' && method==='GET') return json(res,200,{sellers:db.prepare('SELECT * FROM sellers ORDER BY id DESC').all()});

    if(pathname==='/api/admin/marketplace/quality-event' && method==='POST'){if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});const sub=db.prepare('SELECT id,seller_id,order_id,status FROM seller_suborders WHERE id=?').get(toInt(body?.suborderId));const type=clean(body?.type,30),reason=clean(body?.reason,1000);if(!sub||!['defect','seller_cancellation'].includes(type)||reason.length<10)return json(res,400,{error:'Select a seller sub-order, event type and explain the evidence (10+ characters).'});if(type==='seller_cancellation'&&sub.status!=='cancelled')return json(res,409,{error:'Only a cancelled seller sub-order can be attributed as a seller-caused cancellation.'});if(type==='defect'&&!['delivered','returned'].includes(sub.status))return json(res,409,{error:'A defect event can only be recorded after delivery or return.'});try{const r=db.prepare('INSERT INTO seller_quality_events(seller_id,suborder_id,order_id,event_type,reason,created_by) VALUES(?,?,?,?,?,?)').run(sub.seller_id,sub.id,sub.order_id,type,reason,user.id);auditLog(user.id,'seller-quality-event','seller_suborder',sub.id,{type,eventId:Number(r.lastInsertRowid)});return json(res,201,{ok:true,eventId:Number(r.lastInsertRowid)});}catch{return json(res,409,{error:'This quality event was already recorded for the seller sub-order.'});}}
    if(pathname==='/api/admin/marketplace/seller-policy' && method==='GET'){if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});return json(res,200,{rules:db.prepare('SELECT * FROM seller_policy_rules WHERE id=1').get(),events:db.prepare('SELECT e.*,s.name seller_name FROM seller_policy_events e JOIN sellers s ON s.id=e.seller_id ORDER BY e.id DESC LIMIT 100').all()});}
    if(pathname==='/api/admin/marketplace/seller-policy' && method==='PUT'){if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});const b=body||{},days=toInt(b.lookbackDays,30),sla=toInt(b.dispatchSlaHours,48),late=Number(b.maxLateDispatchRate),cancel=Number(b.maxCancellationRate),defect=Number(b.maxDefectRate),response=Number(b.minResponseRate),sample=toInt(b.minSampleSize,5),action=clean(b.action,20);if(days<7||days>90||sla<1||sla>720||![late,cancel,defect,response].every(Number.isFinite)||late<0||late>100||cancel<0||cancel>100||defect<0||defect>100||response<0||response>100||sample<1||sample>1000||!['warning','payout_hold','pause_listings','suspend'].includes(action))return json(res,400,{error:'Invalid seller policy settings.'});db.prepare("UPDATE seller_policy_rules SET lookback_days=?,dispatch_sla_hours=?,max_late_dispatch_rate=?,max_cancellation_rate=?,max_defect_rate=?,min_response_rate=?,min_sample_size=?,action=?,enabled=?,updated_at=datetime('now') WHERE id=1").run(days,sla,late,cancel,defect,response,sample,action,b.enabled?1:0);db.prepare("UPDATE seller_suborders SET dispatch_due_at=datetime(created_at,'+' || ? || ' hours') WHERE dispatched_at='' AND status NOT IN ('cancelled','returned')").run(sla);auditLog(user.id,'update-seller-policy','seller_policy','1',{enabled:!!b.enabled,action});return json(res,200,{ok:true});}
    if(pathname==='/api/admin/marketplace/seller-policy/run' && method==='POST'){if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});const sellers=db.prepare("SELECT id FROM sellers WHERE status IN ('approved','suspended') ORDER BY id").all();const results=sellers.map(x=>({sellerId:x.id,...enforceSellerPolicy(x.id,user.id)}));return json(res,200,{processed:results.length,results});}
    if(pathname==='/api/admin/marketplace/seller-performance' && method==='GET'){if(!user||user.role!=='admin')return json(res,403,{error:'Admin access only.'});const sellers=db.prepare('SELECT id,name,status FROM sellers ORDER BY id DESC').all();const rules=db.prepare('SELECT * FROM seller_policy_rules WHERE id=1').get();return json(res,200,{sellers:sellers.map(s=>({...s,metrics:sellerMetrics(s.id,rules.lookback_days,rules.dispatch_sla_hours)}))});}

    if(pathname==='/api/admin/sellers/status' && method==='POST'){const status=clean(body?.status,20);if(!['approved','rejected','suspended'].includes(status))return json(res,400,{error:'Invalid seller status.'});const sid=toInt(body?.id);db.prepare('UPDATE sellers SET status=? WHERE id=?').run(status,sid);if(status==='approved'&&process.env.AUTO_ROUTE_PAYOUTS==='true'&&process.env.RAZORPAY_ROUTE_ENABLED==='true'){const eligible=db.prepare("SELECT so.id FROM seller_suborders so JOIN orders o ON o.id=so.order_id JOIN seller_profiles k ON k.seller_id=so.seller_id WHERE so.seller_id=? AND o.status='delivered' AND o.payment_status='paid' AND o.payment_method='razorpay' AND so.status='delivered' AND k.kyc_status='verified' AND k.bank_status='verified' AND k.payout_hold=0 AND k.provider_account_id!=''").all(sid);for(const sub of eligible){const result=await executeRouteTransfer(sub.id,user.id);if(!result.ok)console.warn('[route-payout-approval]',sub.id,result.error);}}return json(res,200,{ok:true});}
    if(pathname==='/api/admin/seller-kyc' && method==='GET') return json(res,200,{profiles:db.prepare('SELECT k.*,s.name,s.slug,s.status AS seller_status FROM seller_profiles k JOIN sellers s ON s.id=k.seller_id ORDER BY k.updated_at DESC').all()});
    if(pathname==='/api/admin/seller-bank/status' && method==='POST'){const status=clean(body?.status,20);if(!['verified','rejected'].includes(status))return json(res,400,{error:'Invalid bank verification status.'});db.prepare("UPDATE seller_profiles SET bank_status=?,payout_hold=CASE WHEN ?='verified' AND kyc_status='verified' THEN 0 ELSE 1 END,updated_at=datetime('now') WHERE seller_id=?").run(status,status,toInt(body?.sellerId));return json(res,200,{ok:true});}
    if(pathname==='/api/admin/seller-kyc/status' && method==='POST'){const status=clean(body?.status,20);if(!['under_review','verified','rejected'].includes(status))return json(res,400,{error:'Invalid KYC status.'});db.prepare("UPDATE seller_profiles SET kyc_status=?,payout_hold=CASE WHEN ?='verified' AND bank_status='verified' THEN 0 ELSE 1 END,updated_at=datetime('now') WHERE seller_id=?").run(status,status,toInt(body?.sellerId));return json(res,200,{ok:true});}
    if(pathname==='/api/admin/seller-products' && method==='GET') return json(res,200,{products:db.prepare('SELECT sp.*,s.name AS seller_name,p.name AS product_name FROM seller_products sp JOIN sellers s ON s.id=sp.seller_id JOIN products p ON p.id=sp.product_id ORDER BY sp.id DESC').all()});
    if(pathname==='/api/admin/seller-products/status' && method==='POST'){const status=clean(body?.status,20);if(!['active','rejected','paused'].includes(status))return json(res,400,{error:'Invalid listing status.'});const id=toInt(body?.id);const r=db.prepare('UPDATE seller_products SET status=? WHERE id=?').run(status,id);if(r.changes&&status==='active'){const x=db.prepare('SELECT seller_id,product_id FROM seller_products WHERE id=?').get(id);db.prepare('INSERT INTO product_sellers(product_id,seller_id) VALUES(?,?) ON CONFLICT(product_id) DO UPDATE SET seller_id=excluded.seller_id').run(x.product_id,x.seller_id);db.prepare('UPDATE products SET is_active=1 WHERE id=?').run(x.product_id);}return json(res,200,{ok:true});}
    if(pathname==='/api/admin/gift-cards' && method==='POST'){const amount=toInt(body?.amount);if(amount<100||amount>100000)return json(res,400,{error:'Gift card value must be ₹100–₹100,000.'});const code='CH-'+crypto.randomBytes(8).toString('hex').toUpperCase();db.prepare('INSERT INTO gift_cards(code,balance,initial_value,expires_at) VALUES(?,?,?,?)').run(code,amount,amount,body?.expiresAt||null);auditLog(user.id,'create','gift_card',code,{amount});return json(res,201,{code,balance:amount});}
    const backupDownload = pathname.match(/^\/api\/admin\/backups\/(chandrahasa-[A-Za-z0-9T.-]+\.(?:sqlite|media\.tar\.gz))(\.sha256)?$/);
    if (backupDownload && method === 'GET') {
      const name = backupDownload[1], checksumOnly = !!backupDownload[2];
      const dir = process.env.BACKUP_DIR || path.join(path.dirname(process.env.DATA_PATH || path.join(__dirname,'data','chandrahasa.db')), 'backups');
      const file = path.join(dir, name), checksum = file + '.sha256';
      if (!fs.existsSync(file) || !fs.existsSync(checksum)) return json(res, 404, { error: 'Backup not found or checksum missing.' });
      const expected = fs.readFileSync(checksum,'utf8').trim().split(/\s+/)[0];
      const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (!/^[a-f0-9]{64}$/i.test(expected) || !constantTimeEqual(expected,actual)) return json(res, 409, { error: 'Backup checksum verification failed.' });
      auditLog(user.id, 'backup_download', 'database', name, { sha256: actual, checksumOnly });
      const downloadFile = checksumOnly ? checksum : file;
      res.writeHead(200, { 'Content-Type':checksumOnly?'text/plain; charset=utf-8':name.endsWith('.sqlite')?'application/vnd.sqlite3':'application/gzip', 'Content-Length':fs.statSync(downloadFile).size, 'Content-Disposition':'attachment; filename="'+path.basename(downloadFile)+'"', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
      return fs.createReadStream(downloadFile).pipe(res);
    }
    if (pathname === '/api/admin/backups' && method === 'GET') {
      const dir = process.env.BACKUP_DIR || path.join(path.dirname(process.env.DATA_PATH || path.join(__dirname, 'data', 'chandrahasa.db')), 'backups');
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const backups = fs.readdirSync(dir).filter(n => /^chandrahasa-.*\.sqlite$/.test(n)).map(name => {
        const file = path.join(dir, name), stat = fs.statSync(file);
        return { name, bytes: stat.size, createdAt: stat.mtime.toISOString(), checksumPresent: fs.existsSync(`${file}.sha256`) };
      }).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
      return json(res, 200, { backups: backups.map(b => ({ ...b, mediaArchivePresent: fs.existsSync(path.join(dir,b.name.replace(/\.sqlite$/,'.media.tar.gz'))) })), retentionDays: Math.max(7, Math.min(90, Number(process.env.BACKUP_KEEP_DAYS || 30))) });
    }
    if (pathname === '/api/admin/backups' && method === 'POST') {
      if (!rateLimited(`backup:${user.id}`, 3, 60 * 60 * 1000)) {
        try { const result = await createBackup(); auditLog(user.id, 'backup_created', 'database', result.file, { bytes: result.bytes, sha256: result.sha256 });
          return json(res, 201, { ok: true, backup: { name: path.basename(result.file), bytes: result.bytes, sha256: result.sha256, integrity: result.integrity } });
        } catch (e) { console.error('[backup]', e.message); return json(res, 500, { error: 'Backup failed. Check server logs and persistent volume.' }); }
      }
      return json(res, 429, { error: 'Backup limit reached. Try again later.' });
    }

    if(pathname==='/api/admin/payments/cod/collect' && method==='POST'){
      const orderId=toInt(body?.orderId),methodName=clean(body?.collectionMethod,20),reference=clean(body?.reference,120);
      if(!['cash','upi','card','bank_transfer'].includes(methodName))return json(res,400,{error:'Choose cash, UPI, card or bank transfer.'});
      if(methodName!=='cash'&&reference.length<4)return json(res,400,{error:'A collection reference is required for non-cash COD collection.'});
      const tx=db.transaction(()=>{
        const order=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
        if(!order)throw Error('Order not found.');
        if(order.payment_method!=='cod'||order.status!=='delivered')throw Error('Only delivered COD orders can be marked collected.');
        if(order.payment_status==='paid')return {alreadyPaid:true,paymentId:order.payment_id};
        const paymentId=`COD-${order.id}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
        const changed=db.prepare("UPDATE orders SET payment_status='paid',payment_id=? WHERE id=? AND payment_method='cod' AND status='delivered' AND payment_status!='paid'").run(paymentId,order.id);
        if(changed.changes!==1)throw Error('COD order changed while collection was being recorded.');
        db.prepare('INSERT INTO payments(order_id,gateway,payment_id,method,amount,status,signature) VALUES(?,?,?,?,?,?,?)').run(order.id,'manual_cod',paymentId,methodName,order.total,'paid',`admin:${user.id}:${reference}`);
        db.prepare('INSERT INTO security_events(event_type,actor_user_id,ip_hash,detail) VALUES(?,?,?,?)').run('cod_collection_recorded',user.id,'',JSON.stringify({order_id:order.id,payment_id:paymentId,method:methodName,reference}));
        return {alreadyPaid:false,paymentId,amount:order.total};
      });
      try{const result=tx();if(!result.alreadyPaid){auditLog(user.id,'cod-collection','order',orderId,{paymentId:result.paymentId,method:methodName,reference});enqueueNotification('payment.cod_collected',String(orderId),{orderId,paymentId:result.paymentId,amount:result.amount,method:methodName,reference});}return json(res,200,{ok:true,...result});}
      catch(e){return json(res,409,{error:e.message||'COD collection could not be recorded.'});}
    }

    if(pathname==='/api/admin/payments/reconcile' && method==='POST'){
      const orderId=toInt(body?.orderId,0),ord=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);if(!ord||!ord.gateway_order_id)return json(res,404,{error:'Gateway order not found'});
      if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)return json(res,503,{error:'Razorpay credentials not configured'});
      try{const auth=Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');const gr=await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(ord.gateway_order_id)}/payments`,{headers:{Authorization:`Basic ${auth}`}});const gd=await gr.json();if(!gr.ok)throw Error();const captured=(gd.items||[]).find(x=>x.status==='captured'&&x.amount===ord.total*100&&x.currency==='INR');if(captured){const tx=db.transaction(()=>{if(ord.status==='cancelled'){db.prepare("UPDATE orders SET payment_status='paid',payment_id=? WHERE id=?").run(captured.id,orderId);db.prepare('INSERT INTO security_events(event_type,actor_user_id,ip_hash,detail) VALUES(?,?,?,?)').run('payment_reconciled_after_cancellation',ord.user_id||null,'',JSON.stringify({order_id:orderId,payment_id:captured.id}));}else db.prepare("UPDATE orders SET payment_status='paid',payment_id=?,status='confirmed' WHERE id=?").run(captured.id,orderId);db.prepare('INSERT OR IGNORE INTO payments(order_id,gateway,payment_id,method,amount,status,signature) VALUES(?,?,?,?,?,?,?)').run(orderId,'razorpay',captured.id,captured.method||'online',ord.total,'paid','reconciled');});tx();if(ord.status==='cancelled')enqueueNotification('payment.captured_after_cancellation',String(orderId),{orderId,paymentId:captured.id,amount:ord.total,requiresRefundReview:true});return json(res,200,{ok:true,reconciled:true,payment_id:captured.id,requiresRefundReview:ord.status==='cancelled'});}return json(res,200,{ok:true,reconciled:false,gateway_status:(gd.items||[]).map(x=>x.status)});}catch{return json(res,502,{error:'Gateway reconciliation query failed'});}
    }
    if(pathname==='/api/admin/refunds/reconcile' && method==='POST'){
      const localId=toInt(body?.refundId),local=db.prepare('SELECT * FROM refunds WHERE id=?').get(localId);if(!local||!local.gateway_refund_id)return json(res,404,{error:'A provider refund reference is required before reconciliation.'});if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)return json(res,503,{error:'Razorpay credentials not configured.'});try{const auth=Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');const rr=await fetch(`https://api.razorpay.com/v1/refunds/${encodeURIComponent(local.gateway_refund_id)}`,{headers:{Authorization:`Basic ${auth}`},signal:AbortSignal.timeout(12000)});const rd=await rr.json();if(!rr.ok||rd.id!==local.gateway_refund_id||rd.payment_id!==local.payment_id||Math.round(Number(rd.amount||0)/100)!==local.amount)return json(res,502,{error:'Provider refund details did not match the local refund record.'});const allowed=['pending','processed','failed'];if(!allowed.includes(rd.status))return json(res,409,{error:'Provider returned an unrecognized refund status.'});db.prepare('UPDATE refunds SET status=? WHERE id=?').run(rd.status,localId);const order=db.prepare('SELECT id,total FROM orders WHERE id=?').get(local.order_id);const paid=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE order_id=? AND status IN ('paid','refund_pending','refunded')").get(local.order_id).n;const refunded=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM refunds WHERE order_id=? AND status='processed'").get(local.order_id).n;if(order&&refunded>0)db.prepare("UPDATE orders SET payment_status=CASE WHEN ? >= ? THEN 'refunded' ELSE 'paid' END WHERE id=?").run(refunded,paid,order.id);db.prepare("UPDATE return_fulfilment SET refund_status=?,updated_at=datetime('now') WHERE refund_reference=?").run(rd.status,rd.id);auditLog(user.id,'refund-reconcile','refund',localId,{gateway_refund_id:rd.id,status:rd.status});return json(res,200,{ok:true,refundId:rd.id,status:rd.status});}catch{return json(res,502,{error:'Could not reconcile with Razorpay. Check provider dashboard and retry later.'});}
    }

    if(pathname==='/api/admin/payments/refund' && method==='POST'){
      const orderId=toInt(body?.orderId,0), amount=toInt(body?.amount,0); const ord=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
      if(!ord||ord.payment_method!=='razorpay'||ord.payment_status!=='paid'||!ord.payment_id)return json(res,400,{error:'A captured Razorpay order/payment ID is required. COD refunds use manual bank transfer recording.'});
      if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET) return json(res,503,{error:'Razorpay credentials not configured'});
      const reservation=db.transaction(()=>{
        const paid=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE order_id=? AND payment_id=? AND status IN ('paid','refund_pending')").get(orderId,ord.payment_id).total;
        const reserved=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM refunds WHERE order_id=? AND payment_id=? AND status NOT IN ('failed','rejected')").get(orderId,ord.payment_id).total;
        const available=paid-reserved, refundAmt=amount||available;
        if(refundAmt<=0||refundAmt>available) return {error:true,available};
        const info=db.prepare("INSERT INTO refunds(order_id,payment_id,amount,status) VALUES(?,?,?,'initiating')").run(orderId,ord.payment_id,refundAmt);
        return {id:Number(info.lastInsertRowid),amount:refundAmt};
      });
      const reserved=reservation(); if(reserved.error) return json(res,400,{error:'Refund amount exceeds remaining refundable balance',available:reserved.available});
      try{
        const auth=Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
        const rr=await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(ord.payment_id)}/refund`,{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/json'},body:JSON.stringify({amount:reserved.amount*100,receipt:`CH-REFUND-${reserved.id}`}),signal:AbortSignal.timeout(15000)});
        const rd=await rr.json(); if(!rr.ok||!rd.id) throw Error('Gateway refund failed');
        db.prepare('UPDATE refunds SET gateway_refund_id=?,status=? WHERE id=?').run(rd.id,rd.status||'pending',reserved.id);
        auditLog(user.id,'refund-request','order',orderId,{refund_id:rd.id,amount:reserved.amount});
        return json(res,202,{ok:true,refund_id:rd.id,status:rd.status||'pending',amount:reserved.amount});
      }catch{
        // Do not release the reservation automatically: timeout may mean Razorpay
        // accepted the refund but the response was lost. Reconcile before retrying.
        db.prepare("UPDATE refunds SET status='unknown' WHERE id=?").run(reserved.id);
        return json(res,502,{error:'Refund outcome is unknown. Reconcile this refund with Razorpay before retrying.'});
      }
    }
    if (pathname === '/api/admin/shiprocket/create' && method === 'POST') {
      if (!process.env.SHIPROCKET_EMAIL || !process.env.SHIPROCKET_PASSWORD) return json(res,503,{error:'Shiprocket credentials are not configured.'});
      const id=toInt(body?.orderId,0), order=db.prepare('SELECT * FROM orders WHERE id=?').get(id); if(!order) return json(res,404,{error:'Order not found'});
      if(order.payment_method==='razorpay'&&order.payment_status!=='paid') return json(res,400,{error:'Only paid orders can be shipped'});
      if (order.shiprocket_shipment_id) return json(res, 200, { ok:true, already_created:true, shipment_id:order.shiprocket_shipment_id, order_id:order.shiprocket_order_id || null, awb:order.tracking_number || null });
      const shipmentReservation = db.prepare("UPDATE orders SET shiprocket_state='creating' WHERE id=? AND COALESCE(shiprocket_shipment_id,'')='' AND COALESCE(shiprocket_state,'') IN ('','failed')").run(id);
      if (shipmentReservation.changes !== 1) { const latest=db.prepare('SELECT shiprocket_state,shiprocket_shipment_id,shiprocket_order_id,tracking_number FROM orders WHERE id=?').get(id); if(latest?.shiprocket_shipment_id) return json(res,200,{ok:true,already_created:true,shipment_id:latest.shiprocket_shipment_id,order_id:latest.shiprocket_order_id||null,awb:latest.tracking_number||null}); return json(res,409,{error:'A shipment request is already in progress or has an unknown provider outcome. Reconcile with Shiprocket before retrying.',shipment_state:latest?.shiprocket_state||'unknown'}); }
      try {
        const login=await fetch('https://apiv2.shiprocket.in/v1/external/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.SHIPROCKET_EMAIL,password:process.env.SHIPROCKET_PASSWORD}),signal:AbortSignal.timeout(12000)});
        const ld=await login.json(); if(!login.ok||!ld.token) throw new Error('Shiprocket login failed');
        const addr=JSON.parse(order.address||'{}'), items=db.prepare('SELECT name,price,qty FROM order_items WHERE order_id=?').all(id);
        const productRows=db.prepare('SELECT weight,qty FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?').all(id); const totalWeight=productRows.reduce((sum,r)=>{const n=parseFloat(String(r.weight||'').replace(/[^0-9.]/g,''));return sum+(Number.isFinite(n)&&n>0?n/1000:0.25)*r.qty;},0); const payload={order_id:`CH-${id}`,order_date:new Date().toISOString().slice(0,10),pickup_location:process.env.SHIPROCKET_PICKUP_LOCATION||'Primary',billing_customer_name:addr.name||'Customer',billing_last_name:'',billing_address:addr.line1||'',billing_address_2:addr.line2||'',billing_city:addr.city||'',billing_pincode:addr.pincode||'',billing_state:addr.state||'',billing_country:'India',billing_email:order.email,billing_phone:order.phone,shipping_is_billing:true,order_items:items.map(i=>({name:i.name,sku:`CH-${id}`,units:i.qty,selling_price:i.price})),payment_method:order.payment_method==='cod'?'COD':'Prepaid',sub_total:order.subtotal-order.discount,shipping_charges:order.shipping,order_weight:Math.max(0.1,Number(totalWeight.toFixed(3)))};
        const sr=await fetch('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc',{method:'POST',headers:{Authorization:`Bearer ${ld.token}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});const sd=await sr.json();if(!sr.ok||!sd.shipment_id)throw new Error(sd.message||'Shipment creation failed');
        db.prepare(`UPDATE orders SET shipping_provider=?,shiprocket_shipment_id=?,shiprocket_order_id=?,tracking_number=?,shiprocket_state='created' WHERE id=? AND COALESCE(shiprocket_shipment_id,'')=''`).run('Shiprocket',String(sd.shipment_id),String(sd.order_id||''),String(sd.awb_code||''),id);auditLog(user.id,'create-shipment','order',id,{shipment_id:sd.shipment_id,shiprocket_order_id:sd.order_id,awb:sd.awb_code||null});return json(res,201,{ok:true,shipment_id:sd.shipment_id,order_id:sd.order_id,awb:sd.awb_code||null,channel_order_id:sd.channel_order_id});
      } catch(e){db.prepare("UPDATE orders SET shiprocket_state='unknown' WHERE id=? AND shiprocket_state='creating'").run(id);return json(res,502,{error:'Shiprocket shipment outcome is unknown. Reconcile the CH-'+id+' order in Shiprocket before retrying to avoid duplicate shipments.'});}
    }
    if (pathname === '/api/admin/shiprocket/track' && method === 'GET') {
      const awb=clean(query.get('awb')||'',40); if(!awb)return json(res,400,{error:'AWB is required'});
      if(!process.env.SHIPROCKET_EMAIL||!process.env.SHIPROCKET_PASSWORD)return json(res,503,{error:'Shiprocket credentials not configured'});
      try{const login=await fetch('https://apiv2.shiprocket.in/v1/external/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.SHIPROCKET_EMAIL,password:process.env.SHIPROCKET_PASSWORD}),signal:AbortSignal.timeout(12000)});const ld=await login.json();if(!login.ok||!ld.token)throw Error();const tr=await fetch(`https://apiv2.shiprocket.in/v1/external/courier/track/awb/${encodeURIComponent(awb)}`,{headers:{Authorization:`Bearer ${ld.token}`}});const td=await tr.json();return json(res,tr.status,td);}catch{return json(res,502,{error:'Tracking request failed'});}
    }
    if (pathname === '/api/admin/stats' && method === 'GET') {
      const paid = "payment_status = 'paid'";
      const totals = db.prepare(`SELECT COALESCE(SUM(total),0) revenue, COUNT(*) orders FROM orders WHERE ${paid}`).get();
      const today = db.prepare(`SELECT COALESCE(SUM(total),0) revenue, COUNT(*) orders FROM orders WHERE ${paid} AND date(created_at) = date('now')`).get();
      const pending = db.prepare("SELECT COUNT(*) n FROM orders WHERE status IN ('pending','confirmed')").get().n;
      const lowStock = db.prepare('SELECT id, name, stock FROM products WHERE is_active = 1 AND stock <= 10 ORDER BY stock ASC LIMIT 6').all();
      const series = db.prepare(`SELECT date(created_at) d, COALESCE(SUM(total),0) revenue, COUNT(*) orders FROM orders WHERE ${paid} AND created_at >= datetime('now','-13 days') GROUP BY date(created_at) ORDER BY d`).all();
      const top = db.prepare(`SELECT oi.name, SUM(oi.qty) units, SUM(oi.qty * oi.price) revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.payment_status = 'paid' GROUP BY oi.name ORDER BY units DESC LIMIT 5`).all();
      const customers = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'customer'").get().n;
      return json(res, 200, { totals, today, pending, lowStock, series, top, customers, aov: totals.orders ? Math.round(totals.revenue / totals.orders) : 0 });
    }

    if (pathname === '/api/admin/products' && method === 'GET') {
      const q = clean(query.get('q') || '', 80);
      let rows;
      if (q) rows = db.prepare('SELECT * FROM products WHERE name LIKE ? OR slug LIKE ? OR huid LIKE ? ORDER BY id DESC').all(`%${q}%`, `%${q}%`, `%${q}%`);
      else rows = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
      return json(res, 200, { items: rows.map(productRow) });
    }
    if (pathname === '/api/admin/products' && method === 'POST') {
      const b = body || {};
      const name = clean(b.name, 120), category = clean(b.category_slug, 60);
      const price = toInt(b.price), huid = clean(b.huid, 8);
      if (!name || !category || price <= 0) return json(res, 400, { error: 'Name, category and a positive price are required.' });
      const slug = clean(b.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), 120).toLowerCase();
      if (!db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(category)) return json(res, 400, { error: 'Selected category no longer exists. Refresh Categories and choose a valid category.' });
      if (db.prepare('SELECT 1 FROM products WHERE slug = ?').get(slug)) return json(res, 409, { error: 'Product URL slug already exists.' });
      const images = Array.isArray(b.images) ? b.images.map(x => clean(x, 1000)).filter(Boolean).slice(0, 20) : [];
      db.prepare(`INSERT INTO products (slug,name,category_slug,description,price,compare_price,images,huid,purity,weight,stock,rating,review_count,badge,artisan,artisan_story,is_active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,?)`).run(
        slug, name, category, clean(b.description, 6000), price, toInt(b.compare_price) || null,
        JSON.stringify(images), huid, clean(b.purity, 80) || '', clean(b.weight, 40), Math.max(0,toInt(b.stock)),
        clean(b.badge, 30) || null, clean(b.artisan, 80), clean(b.artisan_story, 6000), b.is_active === false ? 0 : 1
      );
      auditLog(user.id, 'create', 'product', db.prepare('SELECT last_insert_rowid() id').get().id, { name, slug, category });
      return json(res, 201, { ok: true });
    }
    if ((m = pathname.match(/^\/api\/admin\/products\/(\d+)$/))) {
      const id = toInt(m[1]);
      if (method === 'PUT') {
        const b = body || {};
        const current = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        if (!current) return json(res, 404, { error: 'Product not found.' });
        const category = clean(b.category_slug, 60) || current.category_slug;
        if (!db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(category)) return json(res, 400, { error: 'Selected category no longer exists. Refresh Categories and choose a valid category.' });
        const slug = clean(b.slug, 120).toLowerCase() || current.slug;
        if (db.prepare('SELECT 1 FROM products WHERE slug = ? AND id <> ?').get(slug,id)) return json(res, 409, { error: 'Product URL slug already exists.' });
        const images = Array.isArray(b.images) ? b.images.map(x => clean(x,1000)).filter(Boolean).slice(0,20) : JSON.parse(current.images || '[]');
        db.prepare(`UPDATE products SET name=?, slug=?, category_slug=?, description=?, price=?, compare_price=?, images=?, huid=?, purity=?, weight=?, stock=?, badge=?, artisan=?, artisan_story=?, is_active=? WHERE id=?`).run(
          clean(b.name,120) || current.name, slug, category, clean(b.description,6000),
          toInt(b.price) > 0 ? toInt(b.price) : current.price, toInt(b.compare_price) || null,
          JSON.stringify(images), Object.prototype.hasOwnProperty.call(b,'huid') ? clean(b.huid,8) : current.huid,
          clean(b.purity,80), clean(b.weight,40), Math.max(0,toInt(b.stock,current.stock)),
          clean(b.badge,30) || null, clean(b.artisan,80), clean(b.artisan_story,6000),
          b.is_active === false ? 0 : 1, id
        );
        auditLog(user.id, 'update', 'product', id, { name: clean(b.name,120) || current.name, slug, category });
        return json(res, 200, { ok: true });
      }
      if (method === 'DELETE') {
        db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(id); // soft delete — keeps order history intact
        return json(res, 200, { ok: true });
      }
    }

    if (pathname === '/api/admin/orders' && method === 'GET') {
      const status = clean(query.get('status') || '', 30);
      const rows = status && status !== 'all'
        ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 200').all(status)
        : db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200').all();
      const out = rows.map(o => ({ ...o, address: JSON.parse(o.address || '{}'),
        items: db.prepare('SELECT name, qty, price FROM order_items WHERE order_id = ?').all(o.id) }));
      return json(res, 200, { orders: out });
    }
    if ((m = pathname.match(/^\/api\/admin\/orders\/(\d+)\/status$/)) && method === 'PATCH') {
      const allowed = ['pending', 'confirmed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];
      const status = clean(body?.status, 30);
      if (!allowed.includes(status)) return json(res, 400, { error: 'Invalid status.' });
      const orderId=toInt(m[1]);
      const currentOrder=db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
      const transitionError=validateOrderTransition(currentOrder,status);
      if(transitionError)return json(res,currentOrder?409:404,{error:transitionError});
      if(currentOrder.status===status)return json(res,200,{ok:true,unchanged:true});
      let routeSuborders=[];
      const applyTransition=db.transaction(()=>{
        const changed=db.prepare("UPDATE orders SET status=?,shipped_at=CASE WHEN ?='shipped' THEN datetime('now') ELSE shipped_at END,delivered_at=CASE WHEN ?='delivered' THEN datetime('now') ELSE delivered_at END WHERE id=? AND status=?").run(status,status,status,orderId,currentOrder.status);
        if(changed.changes!==1)throw Error('Order state changed concurrently. Refresh and retry.');
        if(status==='cancelled'){
          const stockRelease=db.prepare("INSERT OR IGNORE INTO stock_releases(order_id,reason) VALUES(?,'admin_cancelled')").run(orderId);
          if(stockRelease.changes){
            for(const item of db.prepare('SELECT product_id,qty FROM order_items WHERE order_id=?').all(orderId))if(item.product_id)db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(item.qty,item.product_id);
          }
          const reservedRows=db.prepare('SELECT so.warehouse_id,l.product_id,l.qty FROM seller_suborders so JOIN seller_order_lines l ON l.order_id=so.order_id AND l.seller_id=so.seller_id WHERE so.order_id=? AND so.warehouse_id IS NOT NULL').all(orderId);
          for(const x of reservedRows){
            const released=db.prepare("UPDATE warehouse_inventory SET reserved=reserved-?,updated_at=datetime('now') WHERE warehouse_id=? AND product_id=? AND reserved>=?").run(x.qty,x.warehouse_id,x.product_id,x.qty);
            if(released.changes!==1)throw Error('Seller warehouse reservation mismatch; cancellation rolled back.');
            db.prepare("INSERT INTO inventory_movements(warehouse_id,product_id,delta,reason,reference,actor_user_id) VALUES(?,?,?,'order_reservation_released',?,?)").run(x.warehouse_id,x.product_id,x.qty,String(orderId),user.id);
          }
        }
        if(['cancelled','returned'].includes(status)){
          db.prepare("UPDATE seller_suborders SET status=?,updated_at=datetime('now') WHERE order_id=? AND status!='paid'").run(status,orderId);
          db.prepare("UPDATE seller_order_lines SET status=? WHERE order_id=? AND status!='cleared'").run(status,orderId);
          db.prepare("UPDATE seller_ledger SET kind='reversed' WHERE order_line_id IN (SELECT id FROM seller_order_lines WHERE order_id=?) AND kind='order_pending'").run(orderId);
        }
        if(status==='delivered'){
          const reservedRows=db.prepare('SELECT so.warehouse_id,l.product_id,l.qty FROM seller_suborders so JOIN seller_order_lines l ON l.order_id=so.order_id AND l.seller_id=so.seller_id WHERE so.order_id=? AND so.warehouse_id IS NOT NULL').all(orderId);
          for(const x of reservedRows){
            const consumed=db.prepare("UPDATE warehouse_inventory SET quantity=quantity-?,reserved=reserved-?,updated_at=datetime('now') WHERE warehouse_id=? AND product_id=? AND reserved>=? AND quantity>=?").run(x.qty,x.qty,x.warehouse_id,x.product_id,x.qty,x.qty);
            if(consumed.changes!==1)throw Error('Seller warehouse fulfilment mismatch; delivery update rolled back.');
            db.prepare("INSERT INTO inventory_movements(warehouse_id,product_id,delta,reason,reference,actor_user_id) VALUES(?,?,?,'order_fulfilled',?,?)").run(x.warehouse_id,x.product_id,-x.qty,String(orderId),user.id);
          }
          const payoutDelay=Math.max(0,Math.min(720,Number(process.env.AUTO_ROUTE_PAYOUT_DELAY_HOURS??168)||0));
          db.prepare("UPDATE seller_suborders SET status='delivered',payout_eligible_at=datetime('now','+' || ? || ' hours'),updated_at=datetime('now') WHERE order_id=? AND status NOT IN ('cancelled','returned')").run(payoutDelay,orderId);
          db.prepare("UPDATE seller_order_lines SET status='cleared' WHERE order_id=? AND status='pending'").run(orderId);
          db.prepare("UPDATE seller_ledger SET kind='order_cleared' WHERE order_line_id IN (SELECT id FROM seller_order_lines WHERE order_id=?) AND kind='order_pending'").run(orderId);
          const order=db.prepare('SELECT user_id,total FROM orders WHERE id=?').get(orderId);
          if(order?.user_id){const pts=Math.floor(order.total/100);if(pts>0&&!db.prepare("SELECT id FROM loyalty_ledger WHERE order_id=? AND reason='delivered_order'").get(orderId))db.prepare("INSERT INTO loyalty_ledger(user_id,points,reason,order_id) VALUES(?,?, 'delivered_order',?)").run(order.user_id,pts,orderId);}
          if(process.env.AUTO_ROUTE_PAYOUTS==='true'&&process.env.RAZORPAY_ROUTE_ENABLED==='true'&&payoutDelay===0)routeSuborders=db.prepare('SELECT id FROM seller_suborders WHERE order_id=?').all(orderId);
        }
      });
      try{applyTransition();}catch(e){return json(res,409,{error:e.message||'Order transition failed; no changes were committed.'});}
      for(const sub of routeSuborders){const result=await executeRouteTransfer(sub.id,user.id);if(!result.ok)console.warn('[route-payout]',sub.id,result.error);}
      auditLog(user.id, 'status', 'order', m[1], { status });
      enqueueNotification('order.status_changed',`${orderId}:${status}`,{orderId,status});
      return json(res, 200, { ok: true });
    }

    if (pathname === '/api/admin/customers' && method === 'GET') {
      const rows = db.prepare(`SELECT u.id, u.name, u.email, u.phone, u.created_at,
        COUNT(o.id) orders, COALESCE(SUM(CASE WHEN o.payment_status='paid' THEN o.total END),0) spent
        FROM users u LEFT JOIN orders o ON o.user_id = u.id
        WHERE u.role = 'customer' GROUP BY u.id ORDER BY spent DESC`).all();
      return json(res, 200, { customers: rows });
    }

    if (pathname === '/api/admin/coupons' && method === 'GET') {
      return json(res, 200, { coupons: db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all() });
    }
    if (pathname === '/api/admin/coupons' && method === 'POST') {
      const code = clean(body?.code, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const type = body?.type === 'fixed' ? 'fixed' : 'percentage';
      const value = toInt(body?.value), minOrder = toInt(body?.min_order), limit = Math.max(1, toInt(body?.usage_limit, 1000));
      if (!code || value <= 0) return json(res, 400, { error: 'Code and value are required.' });
      if (db.prepare('SELECT 1 FROM coupons WHERE code = ?').get(code)) return json(res, 409, { error: 'Code already exists.' });
      db.prepare('INSERT INTO coupons (code, type, value, min_order, usage_limit) VALUES (?,?,?,?,?)').run(code, type, value, minOrder, limit);
      return json(res, 201, { ok: true });
    }
    if ((m = pathname.match(/^\/api\/admin\/coupons\/(\d+)$/)) && method === 'PATCH') {
      db.prepare('UPDATE coupons SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(toInt(m[1]));
      return json(res, 200, { ok: true });
    }
    if ((m = pathname.match(/^\/api\/admin\/coupons\/(\d+)$/)) && method === 'DELETE') {
      db.prepare('DELETE FROM coupons WHERE id = ?').run(toInt(m[1]));
      return json(res, 200, { ok: true });
    }
    // Dynamic category management.
    if (pathname === '/api/admin/categories' && method === 'GET') {
      return json(res, 200, { categories: db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all() });
    }
    if (pathname === '/api/admin/categories' && method === 'POST') {
      const name = clean(body?.name, 80);
      const slug = clean(body?.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), 80);
      const image = clean(body?.image, 500) || '/assets/img/rings.webp';
      if (!name || !slug) return json(res, 400, { error: 'Category name is required.' });
      try {
        const result = db.prepare('INSERT INTO categories (name, slug, image, sort_order) VALUES (?,?,?,?)')
          .run(name, slug, image, toInt(body?.sort_order));
        auditLog(user.id, 'create', 'category', result.lastInsertRowid, { name, slug });
        return json(res, 201, { ok: true, id: result.lastInsertRowid });
      } catch { return json(res, 409, { error: 'Category slug already exists.' }); }
    }
    if ((m = pathname.match(/^\/api\/admin\/categories\/([0-9]+)$/))) {
      const id = toInt(m[1]);
      if (method === 'PUT') {
        const c = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
        if (!c) return json(res, 404, { error: 'Category not found.' });
        const name = clean(body?.name, 80) || c.name;
        const slug = clean(body?.slug, 80) || c.slug;
        const image = clean(body?.image, 500) || c.image;
        try { db.prepare('UPDATE categories SET name=?,slug=?,image=?,sort_order=? WHERE id=?')
          .run(name, slug, image, toInt(body?.sort_order, c.sort_order), id);
          auditLog(user.id, 'update', 'category', id, { name, slug }); return json(res, 200, { ok: true });
        } catch { return json(res, 409, { error: 'Category slug conflict.' }); }
      }
      if (method === 'DELETE') {
        if (db.prepare('SELECT COUNT(*) n FROM products WHERE category_slug = ?').get((db.prepare('SELECT slug FROM categories WHERE id=?').get(id)||{}).slug || '').n) {
          return json(res, 409, { error: 'Move or archive products in this category first.' });
        }
        db.prepare('DELETE FROM categories WHERE id=?').run(id); auditLog(user.id, 'delete', 'category', id);
        return json(res, 200, { ok: true });
      }
    }

    // Storefront content/configuration key-value settings.
    if (pathname === '/api/admin/settings' && method === 'GET') {
      const settings = Object.fromEntries(db.prepare('SELECT key,value FROM store_settings').all().map(x => [x.key, JSON.parse(x.value)]));
      return json(res, 200, { settings });
    }
    if (pathname === '/api/admin/settings' && method === 'PUT') {
      const fixed = new Set(['store_name','support_email','support_phone','free_shipping_threshold','shipping_fee','announcement','social_links','policies']);
      const entries = Object.entries(body || {});
      if (entries.length > 250) return json(res, 400, { error: 'A maximum of 250 settings can be changed at once.' });
      for (const [key,value] of entries) {
        if (!fixed.has(key) && !/^customization\.[a-z0-9_.-]{1,100}$/.test(key)) return json(res, 400, { error: 'Unsupported setting key: ' + clean(key,120) });
        if (Buffer.byteLength(JSON.stringify(value)) > 4000) return json(res, 400, { error: 'A setting value is too large.' });
      }
      const tx = db.transaction(() => {
        for (const [key,value] of entries) db.prepare("INSERT INTO store_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')").run(key, JSON.stringify(value));
      });
      tx(); auditLog(user.id, 'update', 'settings', 'store', { keys: entries.map(([k])=>k), count: entries.length });
      return json(res, 200, { ok: true, saved: entries.length });
    }

    // Customer support and marketing inboxes.
    if (pathname === '/api/admin/contacts' && method === 'GET') {
      return json(res, 200, { contacts: db.prepare('SELECT * FROM contacts ORDER BY created_at DESC LIMIT 300').all() });
    }
    if (pathname === '/api/admin/newsletter' && method === 'GET') {
      return json(res, 200, { subscribers: db.prepare('SELECT * FROM newsletter ORDER BY created_at DESC LIMIT 1000').all() });
    }
    if (pathname === '/api/admin/reviews' && method === 'GET') {
      return json(res, 200, { reviews: db.prepare('SELECT r.*,p.name product_name FROM reviews r JOIN products p ON p.id=r.product_id ORDER BY r.created_at DESC LIMIT 300').all() });
    }
    if ((m = pathname.match(/^\/api\/admin\/reviews\/([0-9]+)$/)) && method === 'DELETE') {
      const id = toInt(m[1]); const review = db.prepare('SELECT product_id FROM reviews WHERE id=?').get(id);
      if (!review) return json(res, 404, { error: 'Review not found.' });
      db.prepare('DELETE FROM reviews WHERE id=?').run(id);
      const agg = db.prepare('SELECT AVG(rating) avg, COUNT(*) n FROM reviews WHERE product_id=?').get(review.product_id);
      db.prepare('UPDATE products SET rating=?, review_count=? WHERE id=?').run(agg.avg || 0, agg.n, review.product_id);
      auditLog(user.id, 'delete', 'review', id); return json(res, 200, { ok: true });
    }

    // Expanded order fulfillment: carrier, tracking and lifecycle timestamps.
    if ((m = pathname.match(/^\/api\/admin\/orders\/([0-9]+)\/fulfillment$/)) && method === 'PATCH') {
      const id = toInt(m[1]); const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
      if (!order) return json(res, 404, { error: 'Order not found.' });
      const carrier = clean(body?.shipping_provider, 80), tracking = clean(body?.tracking_number, 120), url = clean(body?.tracking_url, 500);
      const status = clean(body?.status, 30);
      const allowed = ['pending','confirmed','shipped','out_for_delivery','delivered','cancelled','returned'];
      if (status && !allowed.includes(status)) return json(res, 400, { error: 'Invalid order status.' });
      if(status)return json(res,400,{error:'Update order lifecycle through the dedicated /status endpoint so inventory and seller ledgers stay in sync.'});
      db.prepare("UPDATE orders SET shipping_provider=?,tracking_number=?,tracking_url=? WHERE id=?")
        .run(carrier, tracking, url, id);
      auditLog(user.id, 'fulfill', 'order', id, { carrier, tracking, status });
      return json(res, 200, { ok: true });
    }

    if (pathname === '/api/admin/audit-log' && method === 'GET') {
      return json(res, 200, { logs: db.prepare('SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 500').all() });
    }
    return json(res, 404, { error: 'Unknown admin route.' });
  }

  return json(res, 404, { error: 'Not found.' });
}

/* ═══════════════ STATIC + SECURITY HEADERS ═══════════════ */
function serveStatic(req, res, pathname) {
  if (pathname.startsWith('/uploads/')) {
    const name = pathname.slice('/uploads/'.length);
    if (!/^[a-f0-9]{36}\.(?:jpg|png|webp|gif)$/.test(name)) { res.writeHead(404); return res.end('Not found'); }
    const dir = path.join(path.dirname(process.env.DATA_PATH || path.join(__dirname,'data','chandrahasa.db')), 'uploads');
    const file = path.join(dir, name);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    const mime = {'.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif'}[ext];
    res.writeHead(200, { 'Content-Type':mime, 'Content-Length':fs.statSync(file).size, 'Cache-Control':'public, max-age=31536000, immutable', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy':'same-origin' });
    return fs.createReadStream(file).pipe(res);
  }
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Bad request'); }
  if (rel === '/') rel = '/index.html';
  // Pretty URLs → extensionless html files (/shop → /shop.html)
  let filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) { res.writeHead(403); return res.end('Forbidden'); }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (fs.existsSync(filePath + '.html')) filePath = filePath + '.html';
    else if (!path.extname(filePath) && fs.existsSync(filePath + '/index.html')) filePath = path.join(filePath, 'index.html');
    else filePath = path.join(PUBLIC_DIR, '404.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  const immutable = /\.(png|jpe?g|webp|woff2?|ico)$/.test(ext);
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' https://checkout.razorpay.com 'sha256-oi5MSaRgEfPlFBt9K4o8e2MNsslue8qJ/IE8HZenmTg=' 'sha256-8IG0Znz4sd8En/E0BO12cufBTu2z9lPjLkiCNkp7Lxo=' 'sha256-qgxx3qGQNz/bnRQxwamPcG4tRLHcwx5PkqCbUwCofwI=' 'sha256-sjgnVCdBelfJNKRwZ3jO5ZoOe9wcKvLfHHCfk7ZR7Io='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.razorpay.com; media-src 'self' blob:; font-src 'self'; connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  };
  const status = filePath.endsWith('404.html') && !pathname.endsWith('404.html') ? 404 : 200;
  res.writeHead(status, headers);
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    if (pathname.startsWith('/api/')) {
      const mutating = ['POST','PUT','PATCH','DELETE'].includes(req.method.toUpperCase());
      if (mutating && req.headers.origin) {
        let origin;
        try { origin = new URL(req.headers.origin); } catch { return send(res, 403, { error: 'Cross-origin request blocked.' }); }
        if (origin.host !== url.host || (origin.protocol !== 'http:' && origin.protocol !== 'https:')) return send(res, 403, { error: 'Cross-origin request blocked.' });
      }
      if (mutating && pathname !== '/api/payments/webhook' && pathname !== '/api/marketplace/kyc/webhook') {
        const cookies = parseCookies(req);
        if (!constantTimeEqual(cookies.ch_csrf, req.headers['x-csrf-token'])) return send(res, 403, { error: 'Security token missing or expired. Refresh and retry.' });
      }
      return await route(req, res, pathname, url.searchParams);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[500]', err);
    send(res, 500, { error: 'Something went wrong on our side.' });
  }
});

// Native RFC6455 WebSocket support for authenticated concierge chat (no third-party runtime dependency).
const chatSockets=new Set();
function wsFrame(textValue,opcode=1){const payload=Buffer.from(textValue);let header;if(payload.length<126){header=Buffer.from([0x80|opcode,payload.length]);}else if(payload.length<65536){header=Buffer.alloc(4);header[0]=0x80|opcode;header[1]=126;header.writeUInt16BE(payload.length,2);}else{header=Buffer.alloc(10);header[0]=0x80|opcode;header[1]=127;header.writeBigUInt64BE(BigInt(payload.length),2);}return Buffer.concat([header,payload]);}
function wsSend(client,obj){if(client.socket.destroyed)return;try{client.socket.write(wsFrame(JSON.stringify(obj)));}catch{client.socket.destroy();}}
function wsBroadcast(threadId,obj){for(const c of chatSockets)if(c.threadId===threadId||c.user.role==='admin')wsSend(c,obj);}
function wsHandleFrame(client,chunk){client.buffer=Buffer.concat([client.buffer||Buffer.alloc(0),chunk]);let off=0;const buf=client.buffer;while(off+2<=buf.length){const b0=buf[off++],b1=buf[off++],opcode=b0&15,masked=!!(b1&128);if(!(b0&128)){client.socket.destroy();return;}let len=b1&127;if(len===126){if(off+2>buf.length){off-=2;break;}len=buf.readUInt16BE(off);off+=2;}else if(len===127){if(off+8>buf.length){off-=2;break;}const n=buf.readBigUInt64BE(off);if(n>8192n){client.socket.destroy();return;}len=Number(n);off+=8;}if(!masked||len>8192){client.socket.destroy();return;}if(off+4+len>buf.length){off-= (len<126?2:len<65536?4:10);break;}const mask=buf.subarray(off,off+4);off+=4;const payload=Buffer.from(buf.subarray(off,off+len));off+=len;for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];if(opcode===8){client.socket.end(wsFrame('',8));chatSockets.delete(client);return;}if(opcode===9){client.socket.write(wsFrame(payload,10));continue;}if(opcode!==1)continue;let data;try{data=JSON.parse(payload.toString('utf8'));}catch{continue;}if(data.type==='message'&&typeof data.message==='string'){if(rateLimited('ws-chat:'+client.user.id,30,60000))continue;const message=clean(data.message,2000);if(!message)continue;let threadId=client.threadId;if(client.user.role==='admin'){threadId=toInt(data.threadId)||threadId;const exists=db.prepare('SELECT id FROM chat_threads WHERE id=?').get(threadId);if(!exists)continue;}const thread=db.prepare('SELECT id,user_id FROM chat_threads WHERE id=?').get(threadId);if(!thread||(client.user.role!=='admin'&&thread.user_id!==client.user.id))continue;const sender=client.user.role==='admin'?'agent':'customer';const r=db.prepare('INSERT INTO chat_messages(thread_id,sender_type,sender_id,message) VALUES(?,?,?,?)').run(threadId,sender,client.user.id,message);db.prepare("UPDATE chat_threads SET updated_at=datetime('now') WHERE id=?").run(threadId);wsBroadcast(threadId,{type:'message',threadId,message:{id:Number(r.lastInsertRowid),sender_type:sender,message,created_at:new Date().toISOString()}});}}client.buffer=buf.subarray(off);}

server.on('upgrade',(req,socket)=>{try{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname!=='/ws/chat'||!req.headers.upgrade||req.headers.upgrade.toLowerCase()!=='websocket')return socket.destroy();const origin=req.headers.origin;if(origin){const o=new URL(origin);if(o.host!==url.host)return socket.destroy();}const user=getUser(req);if(!user||chatSockets.size>=500||rateLimited('chat-ws:'+clientIp(req),20,60000))return socket.destroy();let threadId=toInt(url.searchParams.get('threadId'));if(user.role!=='admin'){let t=db.prepare("SELECT id FROM chat_threads WHERE user_id=? AND status='open' ORDER BY id DESC LIMIT 1").get(user.id);if(!t){const r=db.prepare('INSERT INTO chat_threads(user_id) VALUES(?)').run(user.id);t={id:Number(r.lastInsertRowid)};}threadId=t.id;}else if(threadId&&!db.prepare('SELECT id FROM chat_threads WHERE id=?').get(threadId))return socket.destroy();const key=req.headers['sec-websocket-key'];if(!key)return socket.destroy();const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');const client={socket,user,threadId,buffer:Buffer.alloc(0)};chatSockets.add(client);socket.on('data',buf=>wsHandleFrame(client,buf));socket.on('close',()=>chatSockets.delete(client));socket.on('error',()=>chatSockets.delete(client));wsSend(client,{type:'ready',threadId});}catch{socket.destroy();}});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✦ Chandrahasa running → http://0.0.0.0:${PORT}`);
  setTimeout(()=>runAutomaticRoutePayouts().catch(e=>console.error('[route-payout-scheduler]',e.message)),30000).unref();
  setInterval(()=>runAutomaticRoutePayouts().catch(e=>console.error('[route-payout-scheduler]',e.message)),5*60*1000).unref();
  // Drain a small number of durable notification events per minute. The worker is
  // intentionally inactive until the owner configures a private HTTPS webhook.
  setInterval(async()=>{try{for(let i=0;i<10;i++){const r=await dispatchNotificationOutbox();if(r.empty||r.skipped||r.busy)break;}}catch(e){console.error('[notification-outbox]',e.message);}},15000).unref();
  setInterval(()=>{try{const rules=db.prepare('SELECT enabled FROM seller_policy_rules WHERE id=1').get();if(rules?.enabled){for(const row of db.prepare("SELECT id FROM sellers WHERE status IN ('approved','suspended')").all())enforceSellerPolicy(row.id);}}catch(e){console.error('[seller-policy-scheduler]',e.message)}},60*60*1000).unref();
  // One replica + persistent volume are required for this SQLite-backed scheduler.
  let backupRunning = false;
  const scheduledBackup = async () => {
    if (backupRunning) return;
    backupRunning = true;
    try { const result = await createBackup(); console.log(`[backup] verified ${path.basename(result.file)} (${result.bytes} bytes)`); }
    catch (e) { console.error('[backup] scheduled backup failed:', e.message); }
    finally { backupRunning = false; }
  };
  if (isProd || process.env.ENABLE_SCHEDULED_BACKUPS === 'true') {
    setTimeout(scheduledBackup, 60 * 1000).unref();
    setInterval(scheduledBackup, 24 * 60 * 60 * 1000).unref();
  }
});
