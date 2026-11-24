/* Chandrahasa — account dashboard: orders w/ timeline, wishlist, profile, invoice */
'use strict';

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const fmt = CH.money;

const STATUS_STEPS = ['pending', 'confirmed', 'shipped', 'out_for_delivery', 'delivered'];
const STEP_LABEL = { pending: 'Placed', confirmed: 'Confirmed', shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered' };

function timelineHTML(status) {
  if (['cancelled', 'returned'].includes(status)) return `<div class="status-pill status-${status}">${status.replace('_', ' ')}</div>`;
  const idx = STATUS_STEPS.indexOf(status);
  return '<div class="timeline">' + STATUS_STEPS.map((s, i) =>
    `<div class="tl-step ${i <= idx ? 'done' : ''}">${STEP_LABEL[s]}</div>`).join('') + '</div>';
}

(async function boot() {
  const me = await CH.api('/api/auth/me').catch(() => null);
  if (!me || !me.user) { window.location.href = '/login?next=/account'; return; }
  const user = me.user;
  $('#acctName').textContent = user.name.split(' ')[0];
  $('#pfName').value = user.name; $('#pfPhone').value = user.phone || ''; $('#pfEmail').value = user.email;

  /* tabs */
  $$('.acct-tab[data-tab]').forEach(tab => tab.addEventListener('click', () => {
    $$('.acct-tab[data-tab]').forEach(t => t.classList.toggle('active', t === tab));
    $$('.acct-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + tab.dataset.tab));
  }));

  /* orders */
  const list = $('#ordersList');
  try {
    const { orders } = await CH.api('/api/orders/mine');
    if (!orders.length) {
      list.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--silver-dark)" stroke-width="1.4" style="margin:0 auto 12px"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/></svg><p>No orders yet — your first heirloom is one click away.</p><a class="btn btn-dark btn-sm" style="margin-top:14px" href="/shop">Explore the collection</a></div>';
    } else {
      list.innerHTML = orders.map(o => `
        <article class="order-card" id="order-${o.id}">
          <div class="order-head">
            <span><b style="color:var(--charcoal)">Order #${o.id}</b><br>${new Date(o.created_at + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span class="status-pill status-${o.status}">${o.status.replace(/_/g, ' ')}</span>
            <span style="text-align:right">Total<br><b style="color:var(--charcoal);font-size:15px">${fmt(o.total)}</b></span>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px">
            ${o.items.map(i => `<div style="display:flex;gap:8px;align-items:center;max-width:230px"><img src="${i.image}" alt="${i.name}" width="44" height="52" style="object-fit:cover;border-radius:3px;border:1px solid var(--line)"><span style="font-size:11.5px;color:var(--soft-ink);line-height:1.35">${i.name} × ${i.qty}<br><span style="color:var(--faint)">HUID ${i.huid || '—'}</span></span></div>`).join('')}
          </div>
          ${timelineHTML(o.status)}
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" data-invoice="${o.id}">Download invoice</button>
            <a class="btn btn-outline btn-sm" href="https://wa.me/919000000002?text=${encodeURIComponent('Namaste Chandrahasa — help with order #' + o.id)}" target="_blank" rel="noopener">WhatsApp support</a>
          </div>
        </article>`).join('');
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-invoice]'); if (!btn) return;
        printInvoice(orders.find(o => o.id === Number(btn.dataset.invoice)));
      });
    }
  } catch { list.innerHTML = '<div class="empty-state">Could not load your orders. Please refresh.</div>'; }

  /* seller inquiries and replies */
  try { const data=await CH.api('/api/customer/seller-inquiries'); if((data.inquiries||[]).length){const box=document.createElement('section');box.className='feature-panel';box.style.marginTop='20px';const h=document.createElement('h2');h.textContent='Seller messages';box.append(h);data.inquiries.forEach(q=>{const item=document.createElement('article');item.className='order-card';const title=document.createElement('b');title.textContent=q.seller_name+' · '+q.subject;const body=document.createElement('p');body.textContent=q.message;item.append(title,body);if(q.response_message){const reply=document.createElement('p');reply.textContent='Seller reply: '+q.response_message;item.append(reply);}else{const waiting=document.createElement('small');waiting.textContent='Awaiting seller response';item.append(waiting);}box.append(item);});list.parentElement.append(box);} } catch { /* seller messaging is optional */ }

  /* wishlist */
  try {
    const { items } = await CH.api('/api/wishlist');
    const grid = $('#wishlistGrid');
    grid.innerHTML = items.length ? items.map(CH.productCardHTML).join('') : '<div class="empty-state" style="grid-column:1/-1">Your wishlist is quiet — tap the heart on pieces you love.</div>';
  } catch { /* non-fatal */ }

  /* profile save */
  $('#profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const d = await CH.api('/api/auth/me', { method: 'PATCH', body: { name: $('#pfName').value.trim(), phone: $('#pfPhone').value.trim() } });
      $('#acctName').textContent = (d.user.name || 'friend').split(' ')[0];
      CH.toast('Saved — your details are up to date ✦');
    } catch (err) { CH.toast(err.message); }
  });
})();

/* ── invoice: render a clean GST-style invoice and print it ── */
function printInvoice(order) {
  if (!order) return;
  const date = new Date(order.created_at + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const addr = order.address || {};
  const rows = order.items.map((i, n) => `<tr><td>${n + 1}</td><td>${i.name}${i.huid ? '<br><small>HUID ' + i.huid + '</small>' : ''}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">${fmt(i.price)}</td><td style="text-align:right">${fmt(i.price * i.qty)}</td></tr>`).join('');
  const html = `
  <div style="font-family:Georgia,serif;color:#1c1917;max-width:720px;margin:0 auto;padding:20px">
    <div style="display:flex;justify-content:space-between;border-bottom:3px solid #b8860b;padding-bottom:14px;margin-bottom:18px">
      <div><h1 style="font-size:30px;margin:0">Chandrahasa</h1><div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#9a6f06">Sterling Silver Collection</div></div>
      <div style="text-align:right;font-size:12px"><b>ORDER RECEIPT</b><br>Order #${String(order.id).padStart(5, '0')}<br>${date}</div>
    </div>
    <div style="display:flex;justify-content:space-between;gap:30px;font-size:12px;margin-bottom:16px">
      <div><b>Store</b><br>Chandrahasa</div>
      <div><b>Bill to</b><br>${addr.name || order.email}<br>${[addr.line1, addr.line2, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}<br>${order.email}<br>${order.phone}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#f6f1e8"><th style="text-align:left;padding:8px;border:1px solid #ddd">#</th><th style="text-align:left;border:1px solid #ddd;padding:8px">Item</th><th style="border:1px solid #ddd;padding:8px">Qty</th><th style="border:1px solid #ddd;padding:8px;text-align:right">Rate</th><th style="border:1px solid #ddd;padding:8px;text-align:right">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="text-align:right;font-size:12px;margin-top:12px">
      <div>Subtotal: ${fmt(order.subtotal)}</div>
      <div>Discount: –${fmt(order.discount)} ${order.coupon_code ? '(' + order.coupon_code + ')' : ''}</div>
      <div>Shipping: ${order.shipping ? fmt(order.shipping) : 'FREE'}${order.address && order.address.giftCharge ? ' · Gift wrap ' + fmt(order.address.giftCharge) : ''}</div>
      
      <div style="font-size:17px;font-weight:700;border-top:2px solid #1c1917;padding-top:6px;margin-top:6px">Total: ${fmt(order.total)} ${order.payment_status === 'paid' ? '— PAID' : '— COD'}</div>
    </div>
    <p style="font-size:10px;color:#777;margin-top:20px;border-top:1px solid #ddd;padding-top:10px">This is an order receipt, not a tax invoice. For a GST tax invoice, seller legal name, registered address, GSTIN and tax breakup must be confirmed by the store before issue.</p>
  </div>`;
  const box = $('#invoice-print');
  box.innerHTML = html;
  box.style.display = 'block';
  window.print();
  setTimeout(() => { box.style.display = 'none'; box.innerHTML = ''; }, 800);
}
