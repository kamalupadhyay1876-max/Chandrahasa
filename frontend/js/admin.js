/* Chandrahasa — Admin Studio: live stats, CRUD for products/coupons, order status flow */
'use strict';

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const fmt = CH.money;

/* ── guard: admin only ── */
(async function guard() {
  const showAccessMessage = (message) => {
    const main = $('.admin-main');
    if (!main) return;
    main.innerHTML = `<section class="admin-panel" role="alert" style="max-width:620px;margin:8vh auto;padding:32px">
      <span class="kicker">Chandrahasa · Owner access</span>
      <h1 class="h-serif" style="font-size:clamp(26px,4vw,38px)">Admin access required</h1>
      <p style="line-height:1.7;color:var(--soft-ink)">${message}</p>
      <a class="btn btn-dark" href="/login?next=%2Fadmin">Sign in to Admin</a>
      <a href="/" style="display:inline-block;margin:16px;color:var(--soft-ink)">Return to storefront</a>
    </section>`;
  };
  try {
    const me = await CH.api('/api/auth/me');
    if (!me.user) { window.location.replace('/login?next=%2Fadmin'); return; }
    if (me.user.role !== 'admin') {
      showAccessMessage('You are signed in as a customer. This account does not have owner/admin privileges. Sign out and use the separately provisioned store-owner account.');
      return;
    }
    $('#adminWho').textContent = me.user.name + ' · ' + me.user.email;
    $('#adminGreeting').textContent = me.user.name.split(' ')[0];
    boot();
  } catch {
    window.location.replace('/login?next=%2Fadmin');
  }
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
}
$('#ordersTable')?.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-order]'); if (!sel) return;
  try { await CH.api(`/api/admin/orders/${sel.dataset.order}/status`, { method: 'PATCH', body: { status: sel.value } }); CH.toast(`Order #${sel.dataset.order} → ${sel.value.replace(/_/g, ' ')}`); }
  catch (err) { CH.toast(err.message); loadOrders($('#orderStatusFilter').value); }
});
$('#orderStatusFilter')?.addEventListener('change', (e) => loadOrders(e.target.value));

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
