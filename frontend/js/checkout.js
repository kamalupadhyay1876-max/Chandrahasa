/* Chandrahasa — checkout: cart summary, coupon, gift wrap, PIN autofill, payment */
'use strict';

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const fmt = CH.money;

const state = { items: [], subtotal: 0, discount: 0, shipping: 0, giftCharge: 0, giftWrap: false, coupon: null, method: 'cod', pinTimer: null, loadError: null };

/* ── load cart into summary ── */
async function loadSummary() {
  const wrap = $('#summaryItems');
  try {
    const items = await CH.getCart();
    state.items = Array.isArray(items) ? items : [];
    state.loadError = null;
  } catch (error) {
    state.items = [];
    state.loadError = error || new Error('Cart unavailable');
  }
  if (state.loadError) {
    wrap.innerHTML = `<div class="empty-state" role="alert" style="border:none;padding:20px 8px"><b>We couldn't load your bag.</b><p>Please check your connection and try again. Your saved items have not been removed.</p><button class="btn btn-outline btn-sm" type="button" id="retryCartLoad">Try again</button></div>`;
    $('#retryCartLoad')?.addEventListener('click', loadSummary);
  } else if (!state.items.length) {
    wrap.innerHTML = '<div class="empty-state" style="border:none;padding:20px 8px">Your bag is empty. <a href="/shop" style="color:var(--gold-deep)">Explore the collection →</a></div>';
  } else {
    const safe = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    wrap.innerHTML = state.items.map(i => {
      const image = CH.safeImageUrl(i.image);
      const media = image ? `<img src="${safe(image)}" alt="${safe(i.name)}" loading="lazy">` : '<div class="summary-image-empty" aria-label="No product image available">CH</div>';
      return `<div class="summary-line">${media}
        <div style="flex:1"><b style="font-size:13px;color:var(--charcoal);display:block">${safe(i.name)}</b>
          <span style="font-size:11px;color:var(--faint)">Qty ${safe(i.qty)}${i.size ? ' · Size ' + safe(i.size) : ''} · HUID ${safe(i.huid || '—')}</span></div>
        <b style="font-size:13px">${fmt(i.price * i.qty)}</b>
      </div>`;
    }).join('');
  }
  $('#placeOrderBtn').disabled = Boolean(state.loadError);

  state.subtotal = state.items.reduce((s, i) => s + i.price * i.qty, 0);
  // re-apply pre-saved coupon (from the cart drawer)
  const pre = sessionStorage.getItem('ch_coupon');
  if (pre && !state.coupon) { $('#couponInput').value = pre; applyCoupon(pre, true); }
  recalc();
}

function recalc() {
  const { subtotal, discount, giftWrap } = state;
  const shipping = subtotal - discount >= 999 || subtotal === 0 ? 0 : 79;
  const gift = giftWrap ? 49 : 0;
  state.shipping = shipping; state.giftCharge = gift;
  const total = subtotal - discount + shipping + gift;
  $('#sumSubtotal').textContent = fmt(subtotal);
  $('#sumDiscount').textContent = '– ' + fmt(discount);
  $('#sumShipping').textContent = shipping === 0 ? 'FREE' : fmt(shipping);
  $('#sumGift').textContent = gift ? fmt(gift) : '—';
  $('#sumTotal').textContent = fmt(total);
  $('#placeOrderTotal').textContent = fmt(total);
  $('#payModalAmount').textContent = fmt(total);
}

async function applyCoupon(code, silent) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return;
  try {
    const d = await CH.api('/api/coupons/apply', { body: { code: cleanCode, subtotal: state.subtotal } });
    if (d.valid) { state.coupon = d.code; state.discount = d.discount; sessionStorage.setItem('ch_coupon', d.code); if (!silent) CH.toast(d.message); }
    else { state.coupon = null; state.discount = 0; sessionStorage.removeItem('ch_coupon'); if (!silent) CH.toast(d.message); }
  } catch (err) { if (!silent) CH.toast('Could not apply that code.'); }
  recalc();
}
$('#couponForm').addEventListener('submit', (e) => { e.preventDefault(); applyCoupon($('#couponInput').value); });
$('#giftWrapChk').addEventListener('change', (e) => { state.giftWrap = e.target.checked; recalc(); });

/* ── payment method toggle ── */
CH.$$('.pay-method').forEach(btn => btn.addEventListener('click', () => {
  state.method = btn.dataset.method;
  CH.$$('.pay-method').forEach(b => { const on = b === btn; b.classList.toggle('active', on); b.setAttribute('aria-checked', String(on)); });
}));

async function configureOnlinePayments() {
  const button = $('[data-method="razorpay"]');
  if (!button) return;
  const note = button.querySelector('small');
  button.disabled = true;
  try {
    const config = await CH.api('/api/payments/config');
    if (!config.enabled) {
      if (note) note.textContent = 'Gateway not configured · Cash on delivery available';
      return;
    }
    if (!window.Razorpay) {
      await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-razorpay-checkout]');
        if (existing) {
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', reject, { once: true });
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.dataset.razorpayCheckout = '1';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Secure payment library could not load.'));
        document.head.appendChild(script);
      });
    }
    if (typeof window.Razorpay !== 'function') throw new Error('Secure payment library is unavailable.');
    button.disabled = false;
    if (note) note.textContent = 'UPI · Cards · Netbanking';
  } catch {
    button.disabled = true;
    if (note) note.textContent = 'Online payment temporarily unavailable';
  }
}
configureOnlinePayments();

/* ── PIN code autofill (India Post) with graceful offline fallback ── */
$('#coPincode').addEventListener('input', (e) => {
  const pin = e.target.value.replace(/\D/g, '').slice(0, 6);
  e.target.value = pin;
  clearTimeout(state.pinTimer);
  if (pin.length !== 6) return;
  state.pinTimer = setTimeout(async () => {
    try {
      const res = await fetch('https://api.postalpincode.in/pincode/' + pin, { signal: AbortSignal.timeout(4500) });
      const data = await res.json();
      const office = data && data[0] && data[0].PostOffice && data[0].PostOffice[0];
      if (office) {
        $('#coCity').value = office.District || office.Name || '';
        const stateSel = $('#coState');
        [...stateSel.options].forEach(o => { if (o.text === office.State) stateSel.value = o.text; });
        CH.toast(`PIN matched — ${office.Name}, ${office.State}`);
      }
    } catch { /* offline preview or unknown PIN — manual entry is fine */ }
  }, 350);
});

/* ── submit ── */
const errorBox = $('#checkoutError');
function checkoutIdempotencyKey() {
  let key = sessionStorage.getItem('ch_checkout_idempotency');
  if (!key) { key = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`); sessionStorage.setItem('ch_checkout_idempotency', key); }
  return key;
}
function showError(msg) { errorBox.textContent = msg; errorBox.classList.add('show'); errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

$('#checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.classList.remove('show');
  if (state.loadError) return showError('Your bag could not be loaded. Please retry before placing the order.');
  if (!state.items.length) return showError('Your bag is empty — add a piece before checking out.');
  const phoneField = $('#coPhone'), pinField = $('#coPincode');
  phoneField.setCustomValidity(/^[+]?[0-9 -]{10,15}$/.test(phoneField.value.trim()) ? '' : 'Enter a valid phone number (10–15 digits).');
  pinField.setCustomValidity(/^[1-9][0-9]{5}$/.test(pinField.value.trim()) ? '' : 'Enter a valid 6-digit PIN code.');
  if (!$('#checkoutForm').reportValidity()) return;
  const email = $('#coEmail').value.trim(), phone = phoneField.value.trim();
  const address = { name: $('#coName').value.trim(), line1: $('#coLine1').value.trim(), line2: $('#coLine2').value.trim(), city: $('#coCity').value.trim(), state: $('#coState').value, pincode: $('#coPincode').value.trim() };
  const btn = $('#placeOrderBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Placing your order…';
  try {
    const order = await CH.api('/api/orders', {
      body: {
        email, phone, address,
        items: state.items.map(i => ({ productId: i.productId, qty: i.qty, size: i.size || '' })),
        couponCode: state.coupon || '', giftWrap: state.giftWrap, giftCardCode: $('#giftCardCode').value.trim(), loyaltyPoints: Number($('#loyaltyPoints').value||0), paymentMethod: state.method,
        idempotencyKey: state.method === 'cod' ? checkoutIdempotencyKey() : undefined,
      },
    });
    if ($('#saveAddressChk')?.checked) { try { await CH.api('/api/addresses',{body:{label:'Checkout',name:address.name,phone,email,line1:address.line1,line2:address.line2,city:address.city,state:address.state,pincode:address.pincode,is_default:false}}); } catch (saveErr) { CH.toast('Order created; address could not be saved.'); } }
    if (order.cod) {
      // COD orders are created as confirmed atomically by the server. Do not
      // call the signed-in-only legacy confirmation endpoint for guests.
      sessionStorage.removeItem('ch_checkout_idempotency');
      finishOrder(order.orderId, email, 'cod', '', order.confirmationToken);
      return;
    }
    // Real Razorpay Checkout: gateway-generated payment response is verified by server.
    openGateway(order, email);
  } catch (err) {
    showError(err.message || 'Could not place the order. Please try again.');
    btn.disabled = false; btn.innerHTML = 'Place order — <span id="placeOrderTotal">' + fmt($('#sumTotal').textContent.replace(/[^0-9]/g, '') || 0) + '</span>';
    recalc();
  }
});

/* ── test gateway modal ── */
const payModal = $('#payModal');
let pendingOrder = null, pendingEmail = null;

function openGateway(order, email) {
  pendingOrder = order; pendingEmail = email;
  payModal.classList.add('open'); document.body.style.overflow = 'hidden';
  const btn=$('#payNowBtn'); btn.disabled=false; btn.textContent='Pay securely';
}
function closeGateway() { payModal.classList.remove('open'); document.body.style.overflow = ''; }

$$('.pay-tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.pay-tab').forEach(t => t.classList.toggle('active', t === tab));
  const id = tab.dataset.tab;
  const box = $('#payTabContent');
  if (id === 'upi') box.innerHTML = '<div class="field" style="margin-bottom:10px"><label for="payUpiId" style="font-size:10px;letter-spacing:.18em;color:#3b4a7d;font-weight:700;text-transform:uppercase">UPI ID</label><input id="payUpiId" placeholder="name@okhdfcbank" style="width:100%;border:1px solid #d5dae8;border-radius:6px;padding:11px"></div>';
  else if (id === 'card') box.innerHTML = '<div class="field" style="margin-bottom:10px"><label style="font-size:10px;letter-spacing:.18em;color:#3b4a7d;font-weight:700;text-transform:uppercase">Card number</label><input placeholder="4111 1111 1111 1111" style="width:100%;border:1px solid #d5dae8;border-radius:6px;padding:11px;margin-bottom:8px"><div style="display:flex;gap:8px"><input placeholder="MM/YY" style="flex:1;border:1px solid #d5dae8;border-radius:6px;padding:11px"><input placeholder="CVV" style="flex:1;border:1px solid #d5dae8;border-radius:6px;padding:11px"></div></div>';
  else box.innerHTML = '<div class="field" style="margin-bottom:10px"><label style="font-size:10px;letter-spacing:.18em;color:#3b4a7d;font-weight:700;text-transform:uppercase">Bank</label><select style="width:100%;border:1px solid #d5dae8;border-radius:6px;padding:11px"><option>State Bank of India</option><option>HDFC Bank</option><option>ICICI Bank</option><option>Axis Bank</option><option>Kotak Mahindra</option></select></div>';
}));

$('#payNowBtn').addEventListener('click', async () => {
  if (!pendingOrder?.payment?.gatewayOrderId || !pendingOrder?.payment?.key) { CH.toast('Payment session unavailable. Please retry checkout.'); return; }
  const btn=$('#payNowBtn'); btn.disabled=true; btn.textContent='Opening secure payment…';
  try {
    if (!window.Razorpay) throw new Error('Razorpay Checkout failed to load.');
    const options={key:pendingOrder.payment.key,amount:pendingOrder.payment.amount,currency:'INR',name:'Chandrahasa',description:'Jewellery purchase',order_id:pendingOrder.payment.gatewayOrderId,
      prefill:{email:pendingEmail},theme:{color:'#94764a'},
      handler:async function(response){try{await CH.api('/api/payments/verify',{body:{orderId:pendingOrder.orderId,...response}});closeGateway();finishOrder(pendingOrder.orderId,pendingEmail,'razorpay','online',pendingOrder.confirmationToken);}catch(err){btn.disabled=false;btn.textContent='Pay securely';showError('Payment received response could not be verified. Please contact support with your order ID.');}},
      modal:{ondismiss:function(){btn.disabled=false;btn.textContent='Pay securely';}}};
    const gateway=new Razorpay(options); gateway.on('payment.failed',function(){btn.disabled=false;btn.textContent='Pay securely';showError('Payment failed or was cancelled. Please try again.');});gateway.open();
  } catch(err) {btn.disabled=false;btn.textContent='Pay securely';showError(err.message||'Unable to open payment checkout.');}
});

function finishOrder(orderId, email, method, tab, confirmationToken) {
  sessionStorage.removeItem('ch_coupon');
  CH.clearLocalCart();
  const q = new URLSearchParams({ id: String(orderId), email: email || '', method: method || 'cod', tab: tab || '', token: confirmationToken || '' });
  window.location.href = '/success?' + q.toString();
}

/* ── boot: prefill contact for signed-in users ── */
async function loadSavedAddresses() {
  const select=$('#savedAddressSelect');
  try { const d=await CH.api('/api/addresses'); const list=d.addresses||[];
    select.innerHTML='<option value="">Enter a new address</option>'+list.map(a=>`<option value="${a.id}">${String(a.label||'Address').replace(/[<>]/g,'')} · ${String(a.city||'').replace(/[<>]/g,'')} · ${String(a.pincode||'')}</option>`).join('');
    const chosen=list.find(a=>a.is_default)||list[0]; if(chosen){select.value=String(chosen.id);fillAddress(chosen);}
    select.addEventListener('change',()=>{const a=list.find(x=>String(x.id)===select.value);if(a)fillAddress(a);});
  } catch { select.closest('.field').hidden=true; }
}
function fillAddress(a){$('#coName').value=a.name||'';$('#coPhone').value=a.phone||$('#coPhone').value;$('#coLine1').value=a.line1||'';$('#coLine2').value=a.line2||'';$('#coPincode').value=a.pincode||'';$('#coCity').value=a.city||'';$('#coState').value=a.state||'';}
(async function boot() {
  // store.js owns auth detection and guest-to-account cart merge. Wait for it
  // before reading the cart so a signed-in customer's server cart is not
  // mistaken for an empty guest cart.
  if (CH_STATE?.ready) await CH_STATE.ready;
  await loadSummary();
  try { const me = await CH.api('/api/auth/me'); if (me.user) { $('#coEmail').value = me.user.email; $('#coPhone').value = me.user.phone || ''; $('#coName').value = me.user.name || ''; await loadSavedAddresses(); try{const rw=await CH.api('/api/loyalty');$('#loyaltyPoints').max=String(Math.max(0,rw.points));$('#loyaltyBalanceHint').textContent=`Available: ${Math.max(0,rw.points)} points. Redemption is capped at 20% of eligible order value.`;}catch{} } }
  catch { /* guest checkout */ }
})();
