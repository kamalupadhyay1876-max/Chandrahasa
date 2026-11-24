/* Chandrahasa — live catalogue card renderer. Values are escaped before insertion. */
'use strict';
CH.escapeHTML = CH.escapeHTML || function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
};
CH.productCardHTML = function productCardHTML(p) {
  const esc = CH.escapeHTML;
  const img = p.images && p.images[0] ? p.images[0] : '';
  const image = img
    ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" decoding="async">`
    : `<div class="pc-image-empty" role="img" aria-label="Product image not available"><span>Image coming from catalogue</span></div>`;
  const discount = p.compare_price && p.compare_price > p.price ? Math.round((1 - p.price / p.compare_price) * 100) : 0;
  const badge = p.badge ? `<span class="pc-badge ${/SALE|OFFER|HOT/i.test(p.badge) ? 'gold' : ''}">${esc(p.badge)}</span>` : '';
  const compare = discount ? `<span class="pc-compare">${CH.money(p.compare_price)}</span><span class="pc-off">${discount}% off</span>` : '';
  const hasReviews = Number(p.review_count) > 0 && Number.isFinite(Number(p.rating));
  const rating = hasReviews ? `<div class="pc-meta"><span class="pc-stars" aria-label="Rated ${esc(p.rating)} out of 5">${'★'.repeat(Math.max(0,Math.min(5,Math.round(Number(p.rating)))))}</span><span>${Number(p.rating).toFixed(1)} · ${Number(p.review_count).toLocaleString('en-IN')} reviews</span></div>` : '';
  const maker = p.artisan ? `<span class="pc-artisan">${esc(p.artisan)}</span>` : '';
  const huid = p.huid ? `<div class="pc-huid"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/></svg>HUID ${esc(p.huid)}</div>` : '';
  return `<article class="product-card" data-card="${esc(p.id)}">
    <div class="pc-media"><a href="/product?slug=${encodeURIComponent(p.slug || '')}" aria-label="View ${esc(p.name)}">${image}</a>${badge}
      <button class="pc-wishlist" data-wishlist="${esc(p.id)}" aria-label="Toggle wishlist"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></button>
      <button class="pc-quick" data-add-to-cart="${esc(p.id)}" data-name="${esc(p.name)}" data-price="${Number(p.price)||0}" data-image="${esc(img)}" data-huid="${esc(p.huid||'')}" data-stock="${Number(p.stock)||0}" ${Number(p.stock)<=0?'disabled':''}>${Number(p.stock)>0?'Add to bag':'Unavailable'}</button>
    </div><div class="pc-body">${maker}<a href="/product?slug=${encodeURIComponent(p.slug || '')}" class="pc-title-link"><h3 class="pc-name">${esc(p.name)}</h3></a>${rating}
      <div class="pc-price-row"><span class="pc-price">${CH.money(p.price)}</span>${compare}</div>${huid}
    </div></article>`;
};
CH.renderProductGrid = function renderProductGrid(selector, items) {
  const grid = CH.$(selector); if (!grid) return;
  if (!items || !items.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">No products are available in this collection right now.</div>'; return; }
  grid.innerHTML = items.map(CH.productCardHTML).join('');
};
CH.skeletonGrid = function skeletonGrid(selector, n = 4) {
  const grid = CH.$(selector); if (!grid) return;
  grid.innerHTML = Array.from({length:n},()=>'<div class="product-card" aria-hidden="true"><div class="pc-media skeleton"></div><div class="pc-body"><div class="skeleton" style="height:10px;width:40%"></div><div class="skeleton" style="height:16px;width:90%"></div><div class="skeleton" style="height:20px;width:50%;margin-top:8px"></div></div></div>').join('');
};
