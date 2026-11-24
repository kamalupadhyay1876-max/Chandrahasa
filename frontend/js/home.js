/* Chandrahasa — homepage logic: catalogue sections */
'use strict';

CH.skeletonGrid('#arrivalsGrid', 8);
CH.skeletonGrid('#bestGrid', 4);

/* ── categories (editorial asymmetric grid) ── */
(async function renderCategories() {
  const grid = CH.$('#catGrid');
  if (!grid) return;
  try {
    const { categories } = await CH.api('/api/categories');
    const order = ['rings', 'necklaces', 'earrings', 'pendants', 'bracelets', 'gift-sets'];
    const sorted = categories.slice().sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
    const tall = new Set(['rings', 'bracelets']); // editorial rhythm — two cells span 2 rows
    grid.innerHTML = sorted.map(c => `
      <a class="cat-card ${tall.has(c.slug) ? 'cat-tall' : ''}" href="/shop?category=${c.slug}" aria-label="Shop ${c.name}">
        <img src="${c.image}" alt="${c.name}" loading="lazy" data-fb="/assets/img/rings.webp">
        <span class="cat-label"><b>${c.name}</b><span>${c.count} pieces →</span></span>
      </a>`).join('');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><strong>Collection categories are unavailable.</strong><p>${CH.escapeHTML(err.message || 'The live catalogue could not be reached.')}</p><a class="btn btn-outline btn-sm" href="/shop">Open collection</a></div>`;
  }
})();

/* ── arrivals + best sellers from the live API ── */
(async function renderGrids() {
  try {
    const arrivals = await CH.api('/api/products?sort=newest&limit=8');
    CH.renderProductGrid('#arrivalsGrid', arrivals.items);
  } catch (err) { CH.$('#arrivalsGrid').innerHTML = `<div class="empty-state" style="grid-column:1/-1">Live collection unavailable: ${CH.escapeHTML(err.message || 'Please try again.')}</div>`; }
  try {
    const best = await CH.api('/api/products?sort=popular&limit=4');
    CH.renderProductGrid('#bestGrid', best.items);
  } catch (err) { CH.$('#bestGrid').innerHTML = `<div class="empty-state" style="grid-column:1/-1">Best sellers are unavailable: ${CH.escapeHTML(err.message || 'Please try again.')}</div>`; }
})();

