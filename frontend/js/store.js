/* ════════════════════════════════════════════════════════════
   CHANDRAHASA — Shared client runtime
   Cart (server-synced for members, localStorage for guests),
   wishlist, navbar, search, toasts. No framework — deliberate.
   ════════════════════════════════════════════════════════════ */
'use strict';

const CH = {
  money(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); },
  $(sel, ctx = document) { return ctx.querySelector(sel); },
  $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; },
  async api(path, opts = {}) {
    const method = (opts.method || (opts.body ? 'POST' : 'GET')).toUpperCase();
    const headers = opts.body ? { 'Content-Type': 'application/json' } : {};
    if (['POST','PUT','PATCH','DELETE'].includes(method) && path !== '/api/payments/webhook') {
      const csrfRes = await fetch('/api/security/csrf', { credentials: 'same-origin', cache: 'no-store' });
      if (!csrfRes.ok) throw new Error('Could not initialize request security. Refresh the page.');
      const csrf = await csrfRes.json();
      headers['X-CSRF-Token'] = csrf.token;
    }
    const res = await fetch(path, {
      headers,
      method,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  },
  toast(msg) {
    let wrap = CH.$('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 350); }, 3800);
  },
};

/* ──────────────────────── STATE ─────────────────────────── */
const CH_STATE = { user: null, guestCart: null, serverCart: null, wishlistIds: new Set(), loaded: false, cartError: null };
CH_STATE.ready = new Promise(resolve => { CH_STATE.resolveReady = resolve; });

function guestCartLoad() {
  if (CH_STATE.guestCart) return CH_STATE.guestCart;
  try { CH_STATE.guestCart = JSON.parse(localStorage.getItem('ch_cart') || '[]'); } catch { CH_STATE.guestCart = []; }
  return CH_STATE.guestCart;
}
function guestCartSave(items) { CH_STATE.guestCart = items; localStorage.setItem('ch_cart', JSON.stringify(items)); }

function cartTotals(items) {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = subtotal >= 999 || subtotal === 0 ? 0 : 79;
  return { subtotal, shipping, discount: 0, total: subtotal + shipping };
}
function cartCount(items) { return items.reduce((s, i) => s + i.qty, 0); }

CH.getCart = async function getCart() {
  if (CH_STATE.user) {
    const data = await CH.api('/api/cart');
    CH_STATE.serverCart = (data.items || []).map(i => ({
      productId: i.id, slug: i.slug, name: i.name, price: i.price, compare_price: i.compare_price,
      image: (i.images && i.images[0]) || '', huid: i.huid, qty: i.qty, size: i.size || '', stock: i.stock,
    }));
    return CH_STATE.serverCart;
  }
  return guestCartLoad().map(i => ({ ...i, size: i.size || '' }));
};

CH.addToCart = async function addToCart(item) {
  if (CH_STATE.user) {
    const data = await CH.api('/api/cart/items', { body: { productId: item.productId, qty: item.qty || 1, size: item.size || '' } });
    CH_STATE.serverCart = null;
    return data;
  }
  const items = guestCartLoad();
  const found = items.find(i => i.productId === item.productId && (i.size || '') === (item.size || ''));
  const stock = item.stock ?? 99;
  if (found) found.qty = Math.min(stock, found.qty + (item.qty || 1));
  else items.push({ ...item, qty: item.qty || 1, size: item.size || '' });
  guestCartSave(items);
  return { items };
};

CH.updateCartQty = async function updateCartQty(productId, size, qty) {
  if (CH_STATE.user) {
    CH_STATE.serverCart = null;
    return CH.api(`/api/cart/items/${productId}?size=${encodeURIComponent(size || '')}`, { method: 'PATCH', body: { qty } });
  }
  let items = guestCartLoad();
  if (qty <= 0) items = items.filter(i => !(i.productId === productId && (i.size || '') === (size || '')));
  else items = items.map(i => (i.productId === productId && (i.size || '') === (size || '')) ? { ...i, qty: Math.min(20, qty) } : i);
  guestCartSave(items);
  return { items };
};

CH.removeCartItem = async function removeCartItem(productId, size) {
  return CH.updateCartQty(productId, size, 0);
};

CH.clearLocalCart = function clearLocalCart() { guestCartSave([]); };

CH.signOut = async function signOut() {
  try { await CH.api('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* ignore */ }
  CH_STATE.user = null; CH_STATE.serverCart = null;
  window.location.href = '/';
};

/* ─────────────── DRAWER RENDERING ─────────────── */
function renderShipBar(subtotal) {
  const bar = CH.$('#shipBarFill'), msg = CH.$('#shipMsg');
  if (!bar || !msg) return;
  const pct = Math.min(100, (subtotal / 999) * 100);
  bar.style.width = pct + '%';
  if (subtotal >= 999) msg.innerHTML = '✦ <b>Free shipping unlocked</b> — nicely done.';
  else msg.innerHTML = `Add <b>${CH.money(999 - subtotal)}</b> more for free shipping`;
}

function cartLineHTML(i) {
  const safeAttr = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const remoteImage = typeof i.image === 'string' && /^https?:\/\//i.test(i.image) && !/[ \t\r\n"'<>\\\\]/.test(i.image);
  const image = typeof i.image === 'string' && (/^\/(?:uploads|assets)\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(i.image) || remoteImage) ? i.image : '';
  const compare = i.compare_price && i.compare_price > i.price ? `<span class="pc-compare">${CH.money(i.compare_price)}</span>` : '';
  return `<div class="cart-line" data-line="${i.productId}" data-size="${i.size || ''}">
    ${image ? `<img src="${safeAttr(image)}" alt="${safeAttr(i.name)}" loading="lazy">` : '<div class="cart-image-empty" aria-label="No product image available">CH</div>'}
    <div>
      <h4>${safeAttr(i.name)}</h4>
      <div class="cl-huid">${i.huid ? 'HUID ' + safeAttr(i.huid) : 'Product details'}</div>
      ${i.size ? `<div class="cl-huid">Size ${safeAttr(i.size)}</div>` : ''}
      <div class="qty" aria-label="Quantity">
        <button type="button" data-dec aria-label="Decrease">−</button>
        <span>${i.qty}</span>
        <button type="button" data-inc aria-label="Increase">+</button>
      </div>
    </div>
    <div class="cl-price">
      <div><div class="pc-price" style="font-size:16px">${CH.money(i.price * i.qty)}</div>${compare}</div>
      <button class="cl-remove" data-remove aria-label="Remove item">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>
  </div>`;
}

async function refreshCartUI() {
  let items = [];
  try { items = await CH.getCart(); } catch (e) { /* offline — show empty */ }
  const count = cartCount(items);
  CH.$$('.cart-count-badge').forEach(b => { b.textContent = count; b.style.display = count ? 'grid' : 'none'; });

  const wrap = CH.$('#cartItems');
  if (wrap) {
    if (!items.length) {
      wrap.innerHTML = `<div class="cart-empty">
        <svg viewBox="0 0 24 24"><path d="M6 6h15l-1.5 12.5a2 2 0 0 1-2 1.5H8.5a2 2 0 0 1-2-1.5L5 4.5A2 2 0 0 0 3 3H1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10.5" cy="22" r="1"/><circle cx="16.5" cy="22" r="1"/></svg>
        <h3 style="font-family:var(--font-display);color:var(--charcoal);margin-bottom:6px">Your bag is empty</h3>
        <p style="font-size:13px;margin-bottom:16px">Every piece is handcrafted — yours is waiting.</p>
        <a class="btn btn-dark btn-sm" href="/shop">Explore the collection</a></div>`;
    } else {
      wrap.innerHTML = items.map(cartLineHTML).join('');
    }
    const t = cartTotals(items);
    const setText = (id, v) => { const el = CH.$(id); if (el) el.textContent = v; };
    setText('#cartSubtotal', CH.money(t.subtotal));
    setText('#cartShipping', t.shipping === 0 ? 'FREE' : CH.money(t.shipping));
    setText('#cartTotal', CH.money(t.total));
    renderShipBar(t.subtotal);
  }
  return items;
}

CH.openCart = function openCart() { CH.$('#cartDrawer')?.classList.add('open'); CH.$('#cartOverlay')?.classList.add('open'); document.body.style.overflow = 'hidden'; refreshCartUI(); };
CH.closeCart = function closeCart() { CH.$('#cartDrawer')?.classList.remove('open'); CH.$('#cartOverlay')?.classList.remove('open'); document.body.style.overflow = ''; };

/* ─────────────── BOOTSTRAP ─────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // navbar scroll
  const nav = CH.$('.nav');
  const onScroll = () => nav && nav.classList.toggle('scrolled', window.scrollY > 30);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // mobile menu
  CH.$('#hamburger')?.addEventListener('click', () => document.body.classList.toggle('menu-open'));

  // cart open/close
  CH.$$('[data-open-cart]').forEach(b => b.addEventListener('click', CH.openCart));
  CH.$('#cartClose')?.addEventListener('click', CH.closeCart);
  CH.$('#cartOverlay')?.addEventListener('click', CH.closeCart);

  // delegated cart line actions
  CH.$('#cartItems')?.addEventListener('click', async (e) => {
    const line = e.target.closest('[data-line]'); if (!line) return;
    const productId = Number(line.dataset.line); const size = line.dataset.size || '';
    const qtySpan = CH.$('.qty span', line); const qty = Number(qtySpan?.textContent || 1);
    if (e.target.closest('[data-inc]')) await CH.updateCartQty(productId, size, qty + 1);
    else if (e.target.closest('[data-dec]')) await CH.updateCartQty(productId, size, qty - 1);
    else if (e.target.closest('[data-remove]')) { await CH.removeCartItem(productId, size); CH.toast('Removed from your bag.'); }
    else return;
    refreshCartUI();
  });

  // add-to-cart buttons (event delegation — works for dynamically rendered grids)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-add-to-cart]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    const productCard = btn.closest('.product-card');
    const cardImage = productCard?.querySelector('.pc-media img');
    const productImage = btn.dataset.image || cardImage?.currentSrc || cardImage?.getAttribute('src') || '';
    const payload = {
      productId: Number(btn.dataset.addToCart),
      qty: 1,
      size: btn.dataset.size || '',
      name: btn.dataset.name || productCard?.querySelector('.pc-name')?.textContent?.trim() || 'Chandrahasa Piece',
      price: Number(btn.dataset.price || 0),
      image: productImage,
      huid: btn.dataset.huid || '',
      stock: Number(btn.dataset.stock || 99),
    };
    btn.disabled = true;
    try {
      await CH.addToCart(payload);
      CH.toast(`Added to your bag — ${payload.name}`);
      refreshCartUI();
    } catch (err) { CH.toast(err.message || 'Could not add to bag.'); }
    finally { btn.disabled = false; }
  });

  // wishlist toggle (guests are nudged to sign in)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-wishlist]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    if (!CH_STATE.user) { CH.toast('Sign in to save pieces to your wishlist ✦'); return; }
    try {
      const productId = Number(btn.dataset.wishlist);
      const data = await CH.api('/api/wishlist', { body: { productId } });
      btn.classList.toggle('active', data.wishlisted);
      CH.toast(data.wishlisted ? 'Saved to your wishlist ✦' : 'Removed from wishlist.');
    } catch (err) { CH.toast(err.message); }
  });

  // newsletter forms
  CH.$$('[data-newsletter]').forEach(form => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = CH.$('input[type="email"]', form);
    const email = input?.value?.trim();
    if (!email) return;
    try { const d = await CH.api('/api/newsletter', { body: { email } }); CH.toast(d.message || 'Welcome to the Circle ✦'); form.reset(); }
    catch (err) { CH.toast(err.message); }
  }));

  // auth state + cart badge
  try {
    const me = await CH.api('/api/auth/me');
    CH_STATE.user = me.user;
    // merge guest cart into server cart on sign-in
    const guest = guestCartLoad();
    if (CH_STATE.user && guest.length) {
      try {
        await CH.api('/api/cart/merge', { body: { items: guest.map(i => ({ productId: i.productId, qty: i.qty, size: i.size || '' })) } });
        guestCartSave([]);
      } catch { /* keep guest cart */ }
    }
    // reflect auth in nav
    CH.$$('[data-auth-label]').forEach(el => { el.textContent = CH_STATE.user ? 'Account' : 'Sign In'; });
    CH.$$('[data-signout]').forEach(el => el.classList.toggle('hidden', !CH_STATE.user));
    if (CH_STATE.user) {
      try {
        const wl = await CH.api('/api/wishlist');
        CH_STATE.wishlistIds = new Set((wl.items || []).map(p => p.id));
        CH.$$('[data-wishlist]').forEach(b => b.classList.toggle('active', CH_STATE.wishlistIds.has(Number(b.dataset.wishlist))));
      } catch { /* non-fatal */ }
    }
  } catch { CH_STATE.user = null; }

  await refreshCartUI();
  CH_STATE.loaded = true;
  CH_STATE.resolveReady?.(CH_STATE);
  CH_STATE.resolveReady = null;

  // Live catalogue search: debounced suggestions + full results route.
  const overlay = CH.$('#searchOverlay');
  if (overlay) {
    const input = CH.$('#searchInput'), results = CH.$('#searchResults');
    const form = CH.$('#globalSearchForm');
    let timer = null, requestId = 0;
    const closeSearch = () => { overlay.classList.remove('open'); document.body.style.overflow = ''; };
    const openSearch = () => { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; setTimeout(() => input?.focus(), 30); };
    CH.$$('[data-open-search]').forEach(b => b.addEventListener('click', openSearch));
    CH.$('#searchClose')?.addEventListener('click', closeSearch);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSearch(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSearch(); CH.closeCart(); } });
    form?.addEventListener('submit', e => { e.preventDefault(); const q = input?.value.trim(); if (q) window.location.href = '/shop?search=' + encodeURIComponent(q); });
    input?.addEventListener('input', () => {
      clearTimeout(timer); const q = input.value.trim(); const id = ++requestId;
      if (q.length < 2) { results.innerHTML = '<p class="search-empty">Type at least 2 characters to search the live collection.</p>'; results.setAttribute('aria-busy','false'); return; }
      results.innerHTML = '<p class="search-loading">Searching the collection…</p>'; results.setAttribute('aria-busy','true');
      timer = setTimeout(async () => {
        try {
          const d = await CH.api('/api/products?search=' + encodeURIComponent(q) + '&limit=6');
          if (id !== requestId) return;
          const items = Array.isArray(d.items) ? d.items : [];
          results.innerHTML = items.length ? items.map(p => {
            const name = CH.escapeHTML ? CH.escapeHTML(p.name) : String(p.name || 'Product');
            const image = p.images?.[0] ? `<img src="${CH.escapeHTML(p.images[0])}" alt="" loading="lazy">` : '<span class="search-no-image" aria-hidden="true">CH</span>' ;
            return `<a class="sr-item" href="/product?slug=${encodeURIComponent(p.slug || '')}">${image}<span><b>${name}</b><span class="sr-price">${CH.money(p.price)}</span></span></a>`;
          }).join('') + `<a class="search-all" href="/shop?search=${encodeURIComponent(q)}">View all results for “${CH.escapeHTML(q)}” →</a>` : '<p class="search-empty">No matching pieces in the live catalogue. Try another term.</p>';
        } catch (err) {
          if (id !== requestId) return;
          results.innerHTML = `<div class="search-error"><b>Search is temporarily unavailable.</b><span>${CH.escapeHTML(err.message || 'The store catalogue could not be reached.')}</span><a href="/shop?search=${encodeURIComponent(q)}">Open the results page</a></div>`;
        } finally { if (id === requestId) results.setAttribute('aria-busy','false'); }
      }, 260);
    });
  }

  // drawer coupon → hand off to checkout
  CH.$('#drawerCouponForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = CH.$('input', e.target);
    const code = (input?.value || '').trim().toUpperCase();
    if (!code) return;
    sessionStorage.setItem('ch_coupon', code);
    CH.toast(`Code ${code} saved — it will be applied at checkout ✦`);
    input.value = '';
  });

  // footer year
  CH.$$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
});

window.CH = CH;
window.CH_STATE = CH_STATE;

/* ── global image fallback (CSP forbids inline handlers, so this is central) ── */
window.addEventListener('error', (e) => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && !t.dataset.fbDone) {
    t.dataset.fbDone = '1';
    if (t.dataset.fb) t.src = t.dataset.fb;
    else { t.hidden = true; t.setAttribute('aria-hidden','true'); }
  }
}, true);


/* Public storefront theme: strict allowlist + value validation, refreshed periodically for live changes. */
async function applyStoreCustomizations(){
  try{
    const response=await CH.api('/api/storefront/customizations');
    const values=response.customizations||{},root=document.documentElement;
    const colors={
      'customization.theme.primary':'--charcoal',
      'customization.theme.accent':'--gold',
      'customization.theme.background':'--cream',
      'customization.theme.surface':'--paper',
      'customization.theme.text':'--ink',
      'customization.theme.muted':'--soft-ink',
      'customization.theme.border':'--line'
    };
    for(const [key,variable] of Object.entries(colors)){
      const value=values[key];
      if(typeof value==='string'&&/^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,%\s]+\))$/.test(value))root.style.setProperty(variable,value);
    }
    const radius=values['customization.theme.radius'];
    if(typeof radius==='string'&&/^\d{1,2}px$/.test(radius))root.style.setProperty('--radius',radius);
    const announcement=values['customization.store.announcement'];
    if(typeof announcement==='string'&&announcement.length<=180){
      const node=document.querySelector('[data-announcement-text]');
      if(node)node.textContent=announcement;
    }
  }catch{/* Keep the default storefront theme if settings are unavailable. */}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyStoreCustomizations,{once:true});else applyStoreCustomizations();
setInterval(()=>{if(!document.hidden)applyStoreCustomizations();},60000);
