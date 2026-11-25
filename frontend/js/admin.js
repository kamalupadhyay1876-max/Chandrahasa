/* Chandrahasa — Admin Studio: live stats, CRUD for products/coupons, order status flow */
'use strict';

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const fmt = CH.money;

/* ── private admin access: sign-in and first-owner setup exist only here ── */
(async function guard() {
  const main = $('.admin-main');
  const showGate = async () => {
    let status = { hasAdmin: true, canBootstrap: false };
    try { status = await CH.api('/api/admin/access/status'); } catch {}
    main.innerHTML = `
      <section class="admin-panel" style="max-width:620px;margin:6vh auto;padding:clamp(22px,5vw,42px)">
        <span class="kicker">Chandrahasa · Private owner portal</span>
        <h1 class="h-serif" style="font-size:clamp(28px,4vw,40px)">${status.canBootstrap ? 'Claim store ownership' : 'Owner sign in'}</h1>
        <p style="line-height:1.7;color:var(--soft-ink)">Admin authentication is available only from this private /admin page. Customer accounts cannot access the workshop.</p>
        <div id="adminGateError" role="alert" style="color:var(--danger);margin:12px 0"></div>
        ${status.canBootstrap ? `
          <form id="ownerBootstrapForm">
            <div class="field"><label for="ownerName">Owner name *</label><input id="ownerName" required maxlength="80" autocomplete="name"></div>
            <div class="field"><label for="ownerEmail">Owner email *</label><input id="ownerEmail" type="email" required autocomplete="email"></div>
            <div class="field"><label for="ownerPhone">Phone</label><input id="ownerPhone" autocomplete="tel"></div>
            <div class="field"><label for="ownerSetupKey">Private one-time setup key *</label><input id="ownerSetupKey" type="password" required autocomplete="off"></div>
            <div class="field"><label for="ownerPassword">Password (16–128 characters) *</label><input id="ownerPassword" type="password" required minlength="16" maxlength="128" autocomplete="new-password"></div>
            <div class="field"><label for="ownerPassword2">Confirm password *</label><input id="ownerPassword2" type="password" required minlength="16" maxlength="128" autocomplete="new-password"></div>
            <button class="btn btn-dark btn-block" type="submit">Create first Owner account</button>
          </form>
        ` : `
          <form id="adminLoginForm">
            <div class="field"><label for="adminEmail">Owner email</label><input id="adminEmail" type="email" required autocomplete="username"></div>
            <div class="field"><label for="adminPassword">Password</label><input id="adminPassword" type="password" required autocomplete="current-password"></div>
            <button class="btn btn-dark btn-block" type="submit">Sign in to Admin Studio</button>
            <p style="margin-top:14px"><a href="/forgot-password">Forgot owner password?</a></p>
          </form>
          ${status.hasAdmin ? '' : '<p>Existing customer data is present but no Admin is provisioned. Use the private Railway recovery procedure; public signup will not grant admin privileges.</p>'}
        `}
        <p style="margin-top:18px"><a href="/">Return to storefront</a></p>
      </section>`;
    $('#adminLoginForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const btn=e.submitter; if(btn)btn.disabled=true;
      try { await CH.api('/api/auth/login',{body:{email:$('#adminEmail').value.trim(),password:$('#adminPassword').value}}); location.reload(); }
      catch(err){$('#adminGateError').textContent=err.message; if(btn)btn.disabled=false;}
    });
    $('#ownerBootstrapForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const btn=e.submitter; if(btn)btn.disabled=true;
      const password=$('#ownerPassword').value;
      if(password!==$('#ownerPassword2').value){$('#adminGateError').textContent='Passwords do not match.';if(btn)btn.disabled=false;return;}
      try {
        await CH.api('/api/auth/signup',{body:{adminPanel:true,name:$('#ownerName').value.trim(),email:$('#ownerEmail').value.trim(),phone:$('#ownerPhone').value.trim(),password,ownerSetupKey:$('#ownerSetupKey').value}});
        location.reload();
      } catch(err){$('#adminGateError').textContent=err.message;if(btn)btn.disabled=false;}
    });
  };
  try {
    const me=await CH.api('/api/auth/me');
    if(!me.user){await showGate();return;}
    if(me.user.role!=='admin'){
      main.innerHTML='<section class="admin-panel" role="alert" style="max-width:620px;margin:8vh auto;padding:32px"><span class="kicker">Private owner portal</span><h1 class="h-serif">Access denied</h1><p>This signed-in customer account does not have Admin permissions.</p><a class="btn btn-outline" href="/account">Customer account</a></section>';
      return;
    }
    $('#adminWho').textContent=me.user.name+' · '+me.user.email;
    $('#adminGreeting').textContent=me.user.name.split(' ')[0];
    boot();
  } catch { await showGate(); }
})();

/* ── tab switching ── */
$$('[data-admin-tab]').forEach(link => link.addEventListener('click', (e) => {
  e.preventDefault();
  const tab = link.dataset.adminTab;
  $$('[data-admin-tab]').forEach(l => l.classList.toggle('active', l === link));
  $$('.admin-tab').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + tab));
  if (tab === 'products') { loadCategories().then(loadProducts); }
  if (tab === 'categories') loadCategories();
  if (tab === 'orders') loadOrders();
  if (tab === 'customers') loadCustomers();
  if (tab === 'coupons') loadCoupons();
  if (tab === 'customize') loadCustomizations();
  if (tab === 'backups') loadBackups();
  if (tab === 'media') loadMediaLibrary();
}));

function boot() { loadStats(); loadCategories(); startAdminLiveRefresh(); }

let adminRefreshTimer = null;
function startAdminLiveRefresh() {
  if (adminRefreshTimer) clearInterval(adminRefreshTimer);
  adminRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    const active = $('.admin-tab:not(.hidden)')?.id;
    if (active === 'tab-overview') loadStats();
    if (active === 'tab-products') loadProducts($('#productSearch')?.value.trim() || '');
    if (active === 'tab-categories') loadCategories();
    if (active === 'tab-orders') loadOrders($('#orderStatusFilter')?.value || 'all');
    if (active === 'tab-customers') loadCustomers();
    if (active === 'tab-coupons') loadCoupons();
  }, 20000);
}

let allCategories = [];
async function loadCategories() {
  const data = await CH.api('/api/admin/categories');
  allCategories = data.categories || [];
  const select = $('#pfCategory');
  if (select) {
    const selected = select.value;
    select.innerHTML = '<option value="">Choose category…</option>' + allCategories.map(c => `<option value="${String(c.slug).replace(/&/g,"&amp;").replace(/"/g,"&quot;")}">${String(c.name).replace(/&/g,"&amp;").replace(/</g,"&lt;")}</option>`).join('');
    if (allCategories.some(c => c.slug === selected)) select.value = selected;
  }
  const tbody = $('#categoriesTable tbody');
  if (tbody) tbody.innerHTML = allCategories.map(c => `<tr><td><b>${escapeAdminText(c.name)}</b></td><td>${escapeAdminText(c.slug)}</td><td>${escapeAdminText(c.image || '')}</td><td>${Number(c.sort_order)||0}</td><td><button class="btn btn-outline btn-sm" data-cat-edit="${c.id}">Edit</button> <button class="btn btn-outline btn-sm" data-cat-delete="${c.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="5">No categories yet. Create your first category above.</td></tr>';
  return allCategories;
}
function escapeAdminText(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
$('#categoryForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id=$('#catId').value, name=$('#catName').value.trim();
  const payload={name,slug:$('#catSlug').value.trim(),image:$('#catImage').value.trim(),sort_order:Number($('#catOrder').value)||0};
  try { await CH.api(id ? '/api/admin/categories/'+id : '/api/admin/categories',{method:id?'PUT':'POST',body:payload}); $('#categoryForm').reset(); $('#catId').value=''; $('#catOrder').value='0'; await loadCategories(); CH.toast('Category saved'); }
  catch(err){CH.toast(err.message);}
});
$('#catCancelBtn')?.addEventListener('click',()=>{ $('#categoryForm').reset(); $('#catId').value=''; $('#catOrder').value='0'; });
$('#categoriesTable')?.addEventListener('click',async e=>{
  const edit=e.target.closest('[data-cat-edit]'), del=e.target.closest('[data-cat-delete]');
  if(edit){const c=allCategories.find(x=>x.id===Number(edit.dataset.catEdit));if(!c)return;$('#catId').value=c.id;$('#catName').value=c.name;$('#catSlug').value=c.slug;$('#catImage').value=c.image||'';$('#catOrder').value=c.sort_order||0;$('#catSaveBtn').textContent='Update category';}
  if(del){if(!confirm('Delete this category? Categories containing products cannot be deleted.'))return;try{await CH.api('/api/admin/categories/'+del.dataset.catDelete,{method:'DELETE'});await loadCategories();CH.toast('Category deleted');}catch(err){CH.toast(err.message);}}
});

/* ══════════ OVERVIEW ══════════ */
async function loadStats() {
  try {
    const s = await CH.api('/api/admin/stats');
    $('#stRevenue').textContent = fmt(s.totals.revenue);
    $('#stRevenueToday').textContent = `+${fmt(s.today.revenue)} today (${s.today.orders} orders)`;
    $('#stOrders').textContent = s.totals.orders;
    $('#stPending').textContent = `${s.pending} awaiting fulfilment`;
    $('#stAov').textContent = fmt(s.aov);
    $('#stCustomers').textContent = s.customers;
    drawSalesChart(s.series);
    $('#topProducts').innerHTML = (s.top.length ? s.top : [{ name: 'No paid orders yet.', units: 0, revenue: 0 }])
      .map(t => `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px"><span>${t.name}</span><span style="color:var(--soft-ink);white-space:nowrap">${t.units} sold · <b style="color:var(--charcoal)">${fmt(t.revenue)}</b></span></div>`).join('');
    $('#lowStock').innerHTML = s.lowStock.length
      ? s.lowStock.map(p => `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px"><span>${p.name}</span><span class="tag-stock ${p.stock === 0 ? 'out' : 'low'}">${p.stock === 0 ? 'OUT' : p.stock + ' left'}</span></div>`).join('')
      : '<p style="color:var(--success);font-size:13px">Everything is well stocked ✓</p>';
  } catch (err) { console.error(err); }
}

function drawSalesChart(series) {
  const svg = $('#salesChart');
  const W = 720, H = 210, padL = 44, padB = 30, padT = 14, padR = 8;
  // build a continuous 14-day axis (fill missing days with zero)
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000); days.push(d.toISOString().slice(0, 10)); }
  const map = Object.fromEntries((series || []).map(r => [r.d, r.revenue]));
  const values = days.map(d => map[d] || 0);
  const max = Math.max(1, ...values);
  const x = (i) => padL + (i * (W - padL - padR)) / 13;
  const y = (v) => H - padB - (v / max) * (H - padB - padT);
  const fmtTick = (v) => v >= 100000 ? '₹' + (v / 100000).toFixed(1) + 'L' : '₹' + (v >= 1000 ? (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k' : Math.round(v));
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(13).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  const grid = [0.25, 0.5, 0.75, 1].map(f => `<line x1="${padL}" x2="${W - padR}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="#e5dfd0" stroke-width="1"/><text x="${padL - 6}" y="${y(max * f) + 4}" text-anchor="end" font-size="9" fill="#8a857f">${fmtTick(max * f)}</text>`).join('');
  const labels = days.filter((_, i) => i % 2 === 0).map(d => { const i = days.indexOf(d); return `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="9" fill="#8a857f">${d.slice(8)}/${d.slice(5, 7)}</text>`; }).join('');
  const dots = values.map((v, i) => v > 0 ? `<circle cx="${x(i)}" cy="${y(v)}" r="3.2" fill="#b8860b"/>` : '').join('');
  svg.innerHTML = `${grid}
    <path d="${area}" fill="rgba(184,134,11,.10)"/>
    <path d="${line}" fill="none" stroke="#b8860b" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${labels}`;
}

/* ══════════ PRODUCTS ══════════ */
let allProducts = [];
async function loadProducts(q) {
  const data = await CH.api('/api/admin/products' + (q ? '?q=' + encodeURIComponent(q) : ''));
  allProducts = data.items;
  const tbody = $('#productsTable tbody');
  tbody.innerHTML = allProducts.map(p => `<tr>
    <td><img src="${p.images[0] || '/assets/img/rings.webp'}" alt="${p.name}" data-fb="/assets/img/rings.webp"></td>
    <td><b style="color:var(--charcoal)">${p.name}</b><br><span style="font-size:11px;color:var(--faint)">${p.slug}</span></td>
    <td style="text-transform:capitalize">${(p.category_slug || '').replace('-', ' ')}</td>
    <td><b>${fmt(p.price)}</b>${p.compare_price ? `<br><span style="font-size:10px;color:var(--faint);text-decoration:line-through">${fmt(p.compare_price)}</span>` : ''}</td>
    <td><span class="tag-stock ${p.stock === 0 ? 'out' : p.stock <= 10 ? 'low' : ''}">${p.stock}</span></td>
    <td style="letter-spacing:.08em;font-size:11px">${p.huid || '—'}</td>
    <td>${p.is_active ? '<span class="tag-stock">Live</span>' : '<span class="tag-stock out">Hidden</span>'}</td>
    <td style="white-space:nowrap"><button class="btn btn-outline btn-sm" data-edit="${p.id}" style="padding:6px 12px;font-size:10px">Edit</button> <button class="btn btn-outline btn-sm" data-del="${p.id}" style="padding:6px 12px;font-size:10px;color:var(--danger);border-color:#dfb3a7">Hide</button></td>
  </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--faint);padding:26px">No pieces match.</td></tr>';
}
let searchT = null;
$('#productSearch')?.addEventListener('input', (e) => { clearTimeout(searchT); searchT = setTimeout(() => loadProducts(e.target.value.trim()), 250); });

$('#productsTable')?.addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-edit]');
  const delBtn = e.target.closest('[data-del]');
  if (editBtn) {
    const p = allProducts.find(x => x.id === Number(editBtn.dataset.edit));
    if (!p) return;
    await loadCategories();
    $('#pfId').value = p.id;
    $('#pfName').value = p.name; $('#pfSlug').value = p.slug || ''; $('#pfCategory').value = p.category_slug; $('#pfBadge').value = p.badge || '';
    $('#pfPrice').value = p.price; $('#pfCompare').value = p.compare_price || ''; $('#pfStock').value = p.stock;
    $('#pfHuid').value = p.huid || ''; $('#pfWeight').value = p.weight || ''; $('#pfPurity').value = p.purity || ''; $('#pfArtisan').value = p.artisan || '';
    $('#pfImages').value = (p.images || []).join('\n'); $('#pfStory').value = p.artisan_story || ''; $('#pfActive').checked = !!p.is_active;
    $('#pfDesc').value = p.description || '';
    $('#productModalTitle').textContent = 'Edit — ' + p.name;
    $('#productModal').classList.add('open');
  }
  if (delBtn) {
    if (!confirm('Hide this piece from the storefront? (Order history is kept.)')) return;
    await CH.api('/api/admin/products/' + delBtn.dataset.del, { method: 'DELETE' });
    CH.toast('Piece hidden from the storefront.');
    loadProducts($('#productSearch').value.trim());
  }
});
$('#addProductBtn')?.addEventListener('click', async () => {
  await loadCategories();
  $('#productForm').reset(); $('#pfId').value = ''; $('#pfSlug').value = ''; $('#pfPurity').value = ''; $('#pfImages').value = ''; $('#pfStory').value = ''; $('#pfActive').checked = true; $('#productModalTitle').textContent = 'Add a new piece';
  if (!allCategories.length) { CH.toast('Create a category first in the Categories section.'); return; }
  $('#productModal').classList.add('open');
});
$('#cancelProductBtn')?.addEventListener('click', () => $('#productModal').classList.remove('open'));
$('#productModal')?.addEventListener('click', (e) => { if (e.target.id === 'productModal') $('#productModal').classList.remove('open'); });

$('#productForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#pfId').value;
  const payload = {
    name: $('#pfName').value.trim(), slug: $('#pfSlug').value.trim(), category_slug: $('#pfCategory').value, badge: $('#pfBadge').value.trim(),
    price: Number($('#pfPrice').value), compare_price: Number($('#pfCompare').value) || null,
    stock: Number($('#pfStock').value), huid: $('#pfHuid').value.trim(), weight: $('#pfWeight').value.trim(),
    artisan: $('#pfArtisan').value.trim(), purity: $('#pfPurity').value.trim(), images: $('#pfImages').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean), artisan_story: $('#pfStory').value.trim(), is_active: $('#pfActive').checked, description: $('#pfDesc').value.trim(),
  };
  try {
    if (id) await CH.api('/api/admin/products/' + id, { method: 'PUT', body: payload });
    else await CH.api('/api/admin/products', { body: payload });
    $('#productModal').classList.remove('open');
    CH.toast(id ? 'Piece updated ✦' : 'New piece added to the collection ✦');
    loadProducts($('#productSearch').value.trim());
  } catch (err) { CH.toast(err.message); }
});

/* ══════════ ORDERS ══════════ */
const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];
async function loadOrders(status) {
  const data = await CH.api('/api/admin/orders' + (status && status !== 'all' ? '?status=' + status : ''));
  const tbody = $('#ordersTable tbody');
  tbody.innerHTML = data.orders.map(o => `<tr>
    <td><b>#${o.id}</b></td>
    <td style="white-space:nowrap;font-size:12px">${new Date(o.created_at + 'Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}<br><span style="color:var(--faint)">${new Date(o.created_at + 'Z').toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></td>
    <td><b style="font-size:12px">${(o.address && o.address.name) || o.email}</b><br><span style="font-size:10.5px;color:var(--faint)">${o.email}</span></td>
    <td style="font-size:11px;max-width:200px">${o.items.map(i => `${i.name} ×${i.qty}`).join('<br>')}</td>
    <td><b>${fmt(o.total)}</b>${o.coupon_code ? `<br><span style="font-size:10px;color:var(--gold-deep)">${o.coupon_code}</span>` : ''}</td>
    <td><span class="status-pill ${o.payment_status === 'paid' ? 'status-confirmed' : 'status-pending'}" style="font-size:8.5px">${o.payment_method === 'cod' ? 'COD' : o.payment_status}</span></td>
    <td><select class="sort-select" data-order="${o.id}" style="padding:7px 10px;font-size:11.5px" aria-label="Update order status">
      ${ORDER_STATUSES.map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('')}
    </select></td>
  </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--faint);padding:26px">No orders yet.</td></tr>';
  renderOrdersBoard(data.orders || []);
}
$('#ordersTable')?.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-order]'); if (!sel) return;
  try { await CH.api(`/api/admin/orders/${sel.dataset.order}/status`, { method: 'PATCH', body: { status: sel.value } }); CH.toast(`Order #${sel.dataset.order} → ${sel.value.replace(/_/g, ' ')}`); }
  catch (err) { CH.toast(err.message); loadOrders($('#orderStatusFilter').value); }
});
$('#orderStatusFilter')?.addEventListener('change', (e) => loadOrders(e.target.value));

/* Accessible drag-and-drop order board: server remains the source of truth. */
const ORDER_LANES = [
  ['pending','New'],['confirmed','Confirmed'],['shipped','Shipped'],
  ['out_for_delivery','Out for delivery'],['delivered','Delivered'],
  ['cancelled','Cancelled'],['returned','Returned']
];
function renderOrdersBoard(orders){
  const host=$('#ordersKanban');if(!host)return;
  host.innerHTML=ORDER_LANES.map(([status,label])=>{
    const rows=orders.filter(o=>o.status===status);
    return '<section class="orders-lane" data-drop-status="'+status+'"><div class="orders-lane-head"><strong>'+label+'</strong><span class="orders-lane-count">'+rows.length+'</span></div><div class="orders-lane-body">'+(rows.length ? rows.map(o=>{
      const customer=escapeAdminText((o.address&&o.address.name)||o.email||'Customer');
      const items=(o.items||[]).map(i=>escapeAdminText(i.name)+' ×'+Number(i.qty||1)).join(' · ');
      return '<article class="order-kanban-card" draggable="true" tabindex="0" data-drag-order="'+Number(o.id)+'" aria-label="Order '+Number(o.id)+', '+customer+'"><div class="order-kanban-top"><b>#CH'+Number(o.id)+'</b><span class="status-pill '+(o.payment_status==='paid'?'status-confirmed':'status-pending')+'">'+escapeAdminText(o.payment_method==='cod'?'COD':o.payment_status||'unpaid')+'</span></div><p><b>'+customer+'</b><br>'+items+'</p><div class="order-kanban-total">'+fmt(o.total)+'</div><select data-board-order="'+Number(o.id)+'" aria-label="Change status for order '+Number(o.id)+'">'+ORDER_STATUSES.map(s=>'<option value="'+s+'" '+(o.status===s?'selected':'')+'>'+s.replace(/_/g,' ')+'</option>').join('')+'</select></article>';
    }).join('') : '<div class="order-kanban-empty">No orders in this stage</div>')+'</div></section>';
  }).join('');
}
let draggedOrderId=null;
$('#ordersKanban')?.addEventListener('dragstart',e=>{
  const card=e.target.closest('[data-drag-order]');if(!card)return;
  draggedOrderId=Number(card.dataset.dragOrder);card.setAttribute('aria-grabbed','true');
  e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(draggedOrderId));
});
$('#ordersKanban')?.addEventListener('dragend',e=>{
  const card=e.target.closest('[data-drag-order]');if(card)card.removeAttribute('aria-grabbed');
  $$('.orders-lane').forEach(l=>l.classList.remove('is-over'));draggedOrderId=null;
});
$('#ordersKanban')?.addEventListener('dragover',e=>{
  const lane=e.target.closest('[data-drop-status]');if(!lane)return;
  e.preventDefault();e.dataTransfer.dropEffect='move';lane.classList.add('is-over');
});
$('#ordersKanban')?.addEventListener('dragleave',e=>{
  const lane=e.target.closest('[data-drop-status]');if(lane&&!lane.contains(e.relatedTarget))lane.classList.remove('is-over');
});
async function saveBoardStatus(id,status){
  if(!id||!ORDER_STATUSES.includes(status))return;
  if(!confirm('Move order #'+id+' to '+status.replace(/_/g,' ')+'? The store will save this status.')){await loadOrders($('#orderStatusFilter').value);return;}
  try{await CH.api('/api/admin/orders/'+id+'/status',{method:'PATCH',body:{status}});CH.toast('Order #'+id+' moved to '+status.replace(/_/g,' '));await loadOrders($('#orderStatusFilter').value);}
  catch(err){CH.toast('Status not changed: '+err.message);await loadOrders($('#orderStatusFilter').value);}
}
$('#ordersKanban')?.addEventListener('drop',async e=>{
  const lane=e.target.closest('[data-drop-status]');if(!lane)return;e.preventDefault();lane.classList.remove('is-over');
  const id=Number(e.dataTransfer.getData('text/plain')||draggedOrderId);await saveBoardStatus(id,lane.dataset.dropStatus);
});
$('#ordersKanban')?.addEventListener('change',e=>{
  const sel=e.target.closest('[data-board-order]');if(sel)saveBoardStatus(Number(sel.dataset.boardOrder),sel.value);
});
$$('[data-orders-view]').forEach(btn=>btn.addEventListener('click',()=>{
  const mode=btn.dataset.ordersView;
  $$$('[data-orders-view]').forEach(b=>b.classList.toggle('active',b===btn));
  $('#ordersKanban')?.classList.toggle('hidden',mode!=='board');
  $('#ordersListView')?.classList.toggle('hidden',mode!=='list');
  if(mode==='board')loadOrders('all');
}));


/* ══════════ CUSTOMERS ══════════ */
async function loadCustomers() {
  const data = await CH.api('/api/admin/customers');
  $('#customersTable tbody').innerHTML = data.customers.map(c => `<tr>
    <td><b>${c.name}</b></td><td style="font-size:12px">${c.email}</td><td style="font-size:12px">${c.phone || '—'}</td>
    <td>${c.orders}</td><td><b>${fmt(c.spent)}</b></td>
    <td style="font-size:12px">${new Date(c.created_at + 'Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
  </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:26px;color:var(--faint)">No customers yet.</td></tr>';
}

/* ══════════ COUPONS ══════════ */
async function loadCoupons() {
  const data = await CH.api('/api/admin/coupons');
  $('#couponList').innerHTML = data.coupons.map(c => `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);flex-wrap:wrap">
    <code style="background:var(--charcoal);color:#f5d678;padding:6px 12px;border-radius:4px;letter-spacing:.14em;font-size:12px">${c.code}</code>
    <div style="font-size:12px;color:var(--soft-ink)">${c.type === 'percentage' ? c.value + '% off' : '₹' + c.value + ' off'} · min ₹${Number(c.min_order).toLocaleString('en-IN')} · ${c.used_count}/${c.usage_limit} used</div>
    <span class="tag-stock ${c.active ? '' : 'out'}">${c.active ? 'Live' : 'Off'}</span>
    <span style="margin-left:auto;display:flex;gap:6px">
      <button class="btn btn-outline btn-sm" data-toggle-coupon="${c.id}" style="padding:6px 10px;font-size:10px">${c.active ? 'Pause' : 'Resume'}</button>
      <button class="btn btn-outline btn-sm" data-del-coupon="${c.id}" style="padding:6px 10px;font-size:10px;color:var(--danger);border-color:#dfb3a7">Delete</button>
    </span>
  </div>`).join('') || '<p style="color:var(--faint);font-size:13px">No coupons yet.</p>';
}
$('#couponForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await CH.api('/api/admin/coupons', { body: { code: $('#cpCode').value, type: $('#cpType').value, value: Number($('#cpValue').value), min_order: Number($('#cpMin').value || 0), usage_limit: Number($('#cpLimit').value || 1000) } });
    CH.toast('Coupon forged ✦'); e.target.reset(); $('#cpMin').value = 999; $('#cpLimit').value = 1000; loadCoupons();
  } catch (err) { CH.toast(err.message); }
});
$('#couponList')?.addEventListener('click', async (e) => {
  const toggle = e.target.closest('[data-toggle-coupon]'), del = e.target.closest('[data-del-coupon]');
  if (toggle) { await CH.api('/api/admin/coupons/' + toggle.dataset.toggleCoupon, { method: 'PATCH' }); loadCoupons(); }
  if (del) { if (!confirm('Delete this coupon permanently?')) return; await CH.api('/api/admin/coupons/' + del.dataset.delCoupon, { method: 'DELETE' }); loadCoupons(); }
});

/* ── 220 owner-controlled customization fields ── */
const customizationGroups = [
  ['Brand identity','store.name,store.tagline,store.short_description,store.logo_url,store.logo_alt,store.favicon_url,store.contact_email,store.contact_phone,store.whatsapp,store.address,store.city,store.state,store.country,store.currency,store.locale,store.timezone,store.copyright,store.footer_note,store.announcement,store.announcement_link'],
  ['Theme & colors','theme.primary,theme.accent,theme.background,theme.surface,theme.text,theme.muted,theme.border,theme.success,theme.warning,theme.danger,theme.radius,theme.shadow,theme.font,theme.heading_font,theme.button_style,theme.button_radius,theme.card_radius,theme.input_radius,theme.header_background,theme.footer_background'],
  ['Header & navigation','header.logo_width,header.logo_height,header.sticky,header.transparent,header.show_search,header.show_account,header.show_wishlist,header.show_cart,header.show_announcement,header.announcement_text,header.announcement_color,header.announcement_background,header.menu_spacing,header.menu_font_size,header.mobile_menu_style,header.mobile_logo_alignment,header.search_placeholder,header.utility_text,header.utility_link,header.topbar_enabled'],
  ['Homepage sections','home.hero_title,home.hero_subtitle,home.hero_image,home.hero_mobile_image,home.hero_cta_text,home.hero_cta_link,home.hero_overlay,home.hero_alignment,home.hero_height,home.show_categories,home.category_title,home.featured_title,home.featured_count,home.show_bestsellers,home.bestseller_title,home.show_new_arrivals,home.new_arrivals_title,home.story_title,home.story_text,home.newsletter_title'],
  ['Product presentation','product.image_ratio,product.gallery_style,product.zoom_enabled,product.show_sku,product.show_huid,product.show_weight,product.show_purity,product.show_artisan,product.show_story,product.show_stock,product.low_stock_threshold,product.show_reviews,product.show_compare_price,product.show_badges,product.show_related,product.related_count,product.description_layout,product.thumbnail_position,product.card_hover,product.quick_view'],
  ['Collection & search','collection.grid_desktop,collection.grid_tablet,collection.grid_mobile,collection.default_sort,collection.show_filters,collection.filter_position,collection.show_price_filter,collection.show_category_filter,collection.show_stock_filter,collection.show_badge_filter,collection.sidebar_width,collection.card_spacing,collection.show_count,collection.pagination_size,collection.search_empty_label,search.min_chars,search.max_results,search.show_suggestions,search.show_recent,search.empty_message'],
  ['Cart & checkout','checkout.guest_enabled,checkout.phone_required,checkout.address_line2,checkout.order_note,checkout.terms_required,checkout.cod_enabled,checkout.cod_fee,checkout.free_shipping_threshold,checkout.shipping_fee,checkout.tax_label,checkout.tax_rate,checkout.coupon_enabled,checkout.stock_hold_minutes,checkout.success_title,checkout.success_message,cart.drawer_enabled,cart.show_recommendations,cart.recommendation_count,cart.empty_message,cart.continue_shopping_text'],
  ['Footer & content','footer.columns,footer.show_newsletter,footer.newsletter_text,footer.show_social,footer.show_payment_icons,footer.show_shipping_info,footer.show_returns_info,footer.show_contact,footer.show_address,footer.show_copyright,content.about_title,content.about_text,content.craft_title,content.craft_text,content.shipping_title,content.returns_title,content.privacy_title,content.terms_title,content.faq_title,content.contact_title'],
  ['SEO & discovery','seo.site_title,seo.meta_description,seo.default_image,seo.robots,seo.canonical_base,seo.og_title,seo.og_description,seo.twitter_handle,seo.schema_brand,seo.schema_price_currency,seo.google_site_verification,seo.bing_site_verification,seo.product_title_template,seo.category_title_template,seo.noindex_search,seo.noindex_account,seo.sitemap_enabled,seo.breadcrumbs_enabled,seo.alt_text_fallback,seo.search_keywords'],
  ['Marketing & social','marketing.instagram,marketing.facebook,marketing.pinterest,marketing.youtube,marketing.whatsapp,marketing.email_signup,marketing.popup_enabled,marketing.popup_delay,marketing.popup_title,marketing.popup_text,marketing.popup_button,marketing.popup_frequency,marketing.referral_enabled,marketing.referral_text,marketing.loyalty_enabled,marketing.loyalty_text,marketing.gift_card_enabled,marketing.gift_card_text,marketing.review_request_delay,marketing.social_proof'],
  ['Operations & policies','ops.support_hours,ops.response_sla,ops.order_prefix,ops.invoice_prefix,ops.low_stock_email,ops.order_email,ops.return_window_days,ops.exchange_enabled,ops.return_enabled,ops.warranty_text,ops.care_instructions,ops.shipping_eta,ops.dispatch_eta,ops.privacy_contact,ops.legal_entity,ops.gst_number,ops.invoice_footer,ops.refund_policy,ops.cancellation_policy,ops.maintenance_message']
];
const customFields = customizationGroups.flatMap(([group,keys]) => keys.split(',').map((key,i)=>({group,key:'customization.'+key,label:key.split('.').slice(1).join(' ').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),type:key.startsWith('theme.')&&['primary','accent','background','surface','text','muted','border','success','warning','danger'].some(k=>key.endsWith('.'+k))?'color':/\.(?:count|width|height|days|minutes|threshold|fee|rate|delay|spacing|font_size|limit|max|min|order)$/.test(key)?'number':key.endsWith('.enabled')||key.endsWith('.sticky')||key.endsWith('.transparent')||key.endsWith('.show_search')||key.endsWith('.show_account')||key.endsWith('.show_wishlist')||key.endsWith('.show_cart')||key.endsWith('.show_announcement')||key.endsWith('.show_categories')||key.endsWith('.show_bestsellers')||key.endsWith('.show_new_arrivals')||key.endsWith('.show_filters')||key.endsWith('.guest_enabled')||key.endsWith('.phone_required')||key.endsWith('.terms_required')||key.endsWith('.cod_enabled')||key.endsWith('.coupon_enabled')||key.endsWith('.drawer_enabled')||key.endsWith('.show_newsletter')||key.endsWith('.show_social')||key.endsWith('.show_payment_icons')||key.endsWith('.show_contact')||key.endsWith('.sitemap_enabled')||key.endsWith('.breadcrumbs_enabled')||key.endsWith('.popup_enabled')||key.endsWith('.referral_enabled')||key.endsWith('.loyalty_enabled')||key.endsWith('.gift_card_enabled')||key.endsWith('.return_enabled')||key.endsWith('.exchange_enabled')?'checkbox':'text'})));
const customizationThemeDefaults = {
  'customization.theme.primary':'#321720','customization.theme.accent':'#a77c45','customization.theme.background':'#f7f2eb',
  'customization.theme.surface':'#fffdf9','customization.theme.text':'#42262e','customization.theme.muted':'#705860',
  'customization.theme.border':'#ece6d9','customization.theme.success':'#1d6f4a','customization.theme.warning':'#a77c45',
  'customization.theme.danger':'#a33b2a'
};
async function loadCustomizations(){
  const data=await CH.api('/api/admin/settings');
  const saved=data.settings||{};
  const host=$('#customizationGroups');if(!host)return;
  host.innerHTML=customizationGroups.map(([group])=>{
    const fields=customFields.filter(f=>f.group===group);
    return '<details class="admin-panel" open><summary style="font-weight:700;cursor:pointer">'+escapeAdminText(group)+' ('+fields.length+')</summary><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:14px">'+fields.map(f=>{
      const value=saved[f.key]??customizationThemeDefaults[f.key]??'';
      const rendered=f.type==='checkbox'?'<input type="checkbox" data-custom-key="'+f.key+'" '+(value===true?'checked':'')+' style="width:20px;height:20px">':'<input type="'+f.type+'" data-custom-key="'+f.key+'" value="'+escapeAdminText(value)+'" maxlength="500" style="width:100%">';
      return '<label style="display:grid;gap:5px;font-size:12px;color:var(--soft-ink)">'+escapeAdminText(f.label)+rendered+'</label>';
    }).join('')+'</div></details>';
  }).join('');
  $('#customizationCount').textContent=customFields.length+' editable controls';
}
$('#saveCustomizationsBtn')?.addEventListener('click',async()=>{
  const values={};
  $$('[data-custom-key]').forEach(el=>{values[el.dataset.customKey]=el.type==='checkbox'?el.checked:el.value.trim();});
  try{const r=await CH.api('/api/admin/settings',{method:'PUT',body:values});CH.toast(r.saved+' customizations saved');await loadCustomizations();}
  catch(err){CH.toast(err.message);}
});

/* ── secure image uploads ── */
function readAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read selected image.'));reader.readAsDataURL(file);});}
async function uploadImage(file){
  if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type)||file.size>8*1024*1024)throw new Error('Choose JPEG, PNG, WebP or GIF under 8 MB.');
  const dataUrl=await readAsDataUrl(file);
  return CH.api('/api/admin/media',{method:'POST',body:{dataUrl}});
}
async function loadMediaLibrary(){
  const data=await CH.api('/api/admin/media');const host=$('#mediaPreviewGrid');if(!host)return;
  host.innerHTML=(data.media||[]).map(item=>'<figure style="margin:0;padding:8px;border:1px solid var(--line);border-radius:8px"><img src="'+item.url+'" alt="Uploaded media" loading="lazy" style="width:100%;aspect-ratio:1;object-fit:cover"><small>'+Math.round(item.bytes/1024)+' KB</small><input readonly value="'+item.url+'" style="width:100%;margin-top:6px"></figure>').join('')||'<p>No uploaded images yet.</p>';
}
$('#uploadMediaBtn')?.addEventListener('click',async()=>{
  const files=[...($('#mediaFiles')?.files||[])];if(!files.length){CH.toast('Choose image files first.');return;}
  const status=$('#mediaUploadStatus');status.textContent='Uploading…';
  try{for(const file of files)await uploadImage(file);
    status.textContent=files.length+' image(s) uploaded.';$('#mediaFiles').value='';await loadMediaLibrary();
  }catch(err){status.textContent=err.message;}
});
$('#pfUpload')?.addEventListener('change',async()=>{
  const files=[...($('#pfUpload').files||[])];if(!files.length)return;
  try{const urls=[];for(const file of files){const result=await uploadImage(file);urls.push(result.url);}
    const field=$('#pfImages');field.value=[field.value.trim(),...urls].filter(Boolean).join('\n');CH.toast(urls.length+' image(s) uploaded and attached.');
  }catch(err){CH.toast(err.message);}
});

/* ── database backup download and restore preparation ── */
async function loadBackups(){
  const data=await CH.api('/api/admin/backups');const tbody=$('#backupsTable tbody');if(!tbody)return;
  tbody.innerHTML=(data.backups||[]).map(b=>'<tr><td>'+escapeAdminText(b.name)+'</td><td>'+new Date(b.createdAt).toLocaleString()+'</td><td>'+Math.round(b.bytes/1024)+' KB</td><td>'+(b.checksumPresent?'Verified':'Missing')+'</td><td><a href="/api/admin/backups/'+encodeURIComponent(b.name)+'">Database</a> · <a href="/api/admin/backups/'+encodeURIComponent(b.name)+'.sha256">Checksum</a>'+(b.mediaArchivePresent?' · <a href="/api/admin/backups/'+encodeURIComponent(b.name.replace(/\.sqlite$/,'.media.tar.gz'))+'">Media</a> · <a href="/api/admin/backups/'+encodeURIComponent(b.name.replace(/\.sqlite$/,'.media.tar.gz'))+'.sha256">Media checksum</a>':'')+'</td></tr>').join('')||'<tr><td colspan="5">No backups available yet.</td></tr>';
}
$('#createBackupBtn')?.addEventListener('click',async()=>{
  const status=$('#backupStatus');status.textContent='Creating and verifying backup…';
  try{const r=await CH.api('/api/admin/backups',{method:'POST',body:{}});status.textContent='Backup created: '+r.backup.name+' · SHA-256 '+r.backup.sha256;await loadBackups();}
  catch(err){status.textContent=err.message;}
});
$('#refreshBackupsBtn')?.addEventListener('click',()=>loadBackups().catch(err=>$('#backupStatus').textContent=err.message));
