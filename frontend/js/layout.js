/* Chandrahasa — layout injector.
   One canonical header / footer / cart drawer / search overlay for every page.
   Runs synchronously at parse time (loaded before store.js) so the rest of the
   JS boots against a complete DOM. Pages with no placeholders are untouched. */
'use strict';

const HEADER = `
<div class="announce" aria-hidden="true"><div class="announce-track" id="announceTrack"></div></div>
<header class="nav">
  <div class="container nav-inner">
    <a class="brand" href="/" aria-label="Chandrahasa — divine jewellery, home">
      <span class="brand-name">Chandrahasa</span>
      <span class="brand-tag">JEWELLERY · CRAFT · DETAIL</span>
    </a>
    <div class="nav-search"><button class="nav-search-trigger" type="button" data-open-search aria-label="Search jewellery"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><span>Search jewellery, styles and more</span></button></div>
    <nav aria-label="Primary">
      <ul class="nav-links">
        <li><a href="/explore">Explore</a></li>
        <li><a href="/shop">All Jewellery</a></li>
        <li><a href="/shop?category=rings">Rings</a></li>
        <li><a href="/shop?category=earrings">Earrings</a></li>
        <li><a href="/shop?category=necklaces">Necklaces</a></li>
        <li><a href="/heritage">Our Story</a></li>
        <li><a href="/contact">Contact</a></li>
      </ul>
    </nav>
    <div class="nav-actions">
      <button class="icon-btn" data-open-search aria-label="Search products">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      </button>
      <a class="icon-btn hide-sm" href="/account" aria-label="My account" data-auth-label-icon>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
      </a>
      <button class="icon-btn" data-open-cart aria-label="Open bag">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6h15l-1.6 12.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L4.8 4.6A2 2 0 0 0 2.9 3H1.8"/><circle cx="10" cy="22" r="1.1"/><circle cx="16.5" cy="22" r="1.1"/></svg>
        <span class="badge-dot cart-count-badge" style="display:none">0</span>
      </button>
      <button class="hamburger" id="hamburger" aria-label="Toggle menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
    </div>
  </div>
  <div class="mobile-menu">
    <a href="/shop">Shop All</a><a href="/shop?category=rings">Rings</a><a href="/shop?category=necklaces">Necklaces</a><a href="/shop?category=earrings">Earrings</a><a href="/shop?category=pendants">Pendants</a><a href="/shop?category=bracelets">Bracelets</a><a href="/heritage">Heritage &amp; Artisans</a><a href="/account">My Account</a><a href="/contact">Contact</a>
  </div>
</header>`;

const FOOTER = `
<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <a class="brand" href="/" style="text-decoration:none"><span class="brand-name">Chandrahasa</span><span class="brand-tag">JEWELLERY · CRAFT · DETAIL</span></a>
        <p style="margin:16px 0 14px;max-width:38ch">Explore the collection, review each product’s details and contact us if you need help choosing.</p>
        <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8d867a">Product details and return terms are listed before checkout</p>
      </div>
      <div>
        <h4>Shop</h4>
        <a href="/shop?category=rings">Rings</a><a href="/shop?category=necklaces">Necklaces</a><a href="/shop?category=earrings">Earrings</a><a href="/shop?category=pendants">Pendants</a><a href="/shop?category=bracelets">Bracelets</a><a href="/shop?category=gift-sets">Gift Sets</a><a href="/shop?sort=popular">Best Sellers</a>
      </div>
      <div>
        <h4>Support</h4>
        <a href="/policies#returns">Returns & Exchanges</a><a href="/policies#shipping">Shipping &amp; Delivery</a><a href="/policies#sizing">Ring Size Guide</a><a href="/policies#care">Silver Care</a><a href="/contact">Contact Us</a><a href="/account">Track / My Orders</a>
      </div>
      <div>
        <h4>Company</h4>
        <a href="/heritage">Heritage &amp; Artisans</a><a href="/policies#privacy">Privacy Policy</a><a href="/policies#terms">Terms of Service</a><a href="/policies#cookies">Cookie Policy</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© <span data-year>2026</span> Chandrahasa</span>
      <span>Product specifications vary by item</span>
    </div>
  </div>
</footer>
<div class="overlay" id="cartOverlay" aria-hidden="true"></div>
<aside class="cart-drawer" id="cartDrawer" role="dialog" aria-label="Shopping bag">
  <div class="cart-head">
    <h3>Your Bag</h3>
    <button class="icon-btn" id="cartClose" aria-label="Close bag">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  </div>
  <div class="ship-progress"><p id="shipMsg">Add ₹999 for free shipping</p><div class="ship-bar"><i id="shipBarFill" style="width:0%"></i></div></div>
  <div class="cart-items" id="cartItems"></div>
  <div class="cart-foot">
    <form class="coupon-row" id="drawerCouponForm">
      <input name="code" placeholder="Promo code" aria-label="Promo code" autocomplete="off">
      <button class="btn btn-outline btn-sm" type="submit">Apply</button>
    </form>
    <div class="totals-row"><span>Subtotal</span><span id="cartSubtotal">₹0</span></div>
    <div class="totals-row"><span>Shipping</span><span id="cartShipping">—</span></div>
    <div class="totals-row grand"><span>Total</span><span id="cartTotal">₹0</span></div>
    <a href="/checkout" class="btn btn-dark btn-block btn-shimmer mt-4">Checkout — Secure &amp; Hallmarked</a>
    <div class="text-center mt-2"><a href="/shop" style="font-size:12px;color:var(--gold-deep);text-decoration:none;letter-spacing:.08em">← Continue shopping</a></div>
  </div>
</aside>
<div class="search-overlay" id="searchOverlay" role="dialog" aria-label="Search">
  <div class="search-box">
    <form class="search-form" id="globalSearchForm" role="search">
      <label class="sr-only" for="searchInput">Search the jewellery collection</label>
      <input id="searchInput" name="q" placeholder="Search rings, necklaces, earrings…" aria-label="Search products" autocomplete="off" spellcheck="false" enterkeyhint="search">
      <button type="submit" class="btn btn-dark search-submit">Search</button>
      <button type="button" class="search-close" id="searchClose" aria-label="Close search">×</button>
    </form>
    <div class="search-hint">Search by product name, category or product detail</div>
    <div class="search-results" id="searchResults" aria-live="polite" aria-busy="false"></div>
  </div>
</div>
<nav class="mobile-tabbar" aria-label="Quick navigation">
  <a href="/" aria-label="Home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg><span>Home</span></a>
  <a href="/explore" aria-label="Explore"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/></svg><span>Explore</span></a>
  <button type="button" data-open-search aria-label="Search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><span>Search</span></button>
  <button type="button" data-open-cart aria-label="Cart"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 2-1.6L22 8H6"/><circle cx="10" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></svg><span>Bag</span><i class="mobile-cart-count cart-count-badge" style="display:none">0</i></button>
  <a href="/account" aria-label="Account"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg><span>Account</span></a>
</nav>`;

(function inject() {
  const headerMount = document.querySelector('[data-layout="header"]');
  const footerMount = document.querySelector('[data-layout="footer"]');
  if (headerMount) headerMount.outerHTML = HEADER;
  if (footerMount) footerMount.outerHTML = FOOTER;
  const experience = document.createElement('script'); experience.src = '/js/experience.js'; experience.defer = true; document.head.appendChild(experience);
  const track = document.getElementById('announceTrack');
  if (track) {
    const unit = '<span>✦ Free shipping above <b>₹999</b></span><span>Product details before you choose</span><span>See current offers at checkout</span>';
    track.innerHTML = unit + unit; // duplicated for a seamless -50% loop
  }
})();
