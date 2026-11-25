/* Chandrahasa — shop/PLP logic: URL-driven filters, live counts, load-more */
'use strict';

const params = new URLSearchParams(window.location.search);
const state = {
  category: params.get('category') || 'all',
  purity: params.get('purity') || '',
  search: (params.get('search') || '').trim(),
  sort: params.get('sort') || 'newest',
  min: params.get('min') || '',
  max: params.get('max') || '',
  sale: params.get('sale') === '1',
  inStock: true,
  page: 1,
  total: 0,
  items: [],
};

const grid = CH.$('#shopGrid');
const countEl = CH.$('#shopCount');
const titleEl = CH.$('#shopTitle');
const sortSelect = CH.$('#sortSelect');

const CAT_NAMES = { all: 'All Silver', rings: 'Rings', necklaces: 'Necklaces', earrings: 'Earrings', pendants: 'Pendants', bracelets: 'Bracelets', 'gift-sets': 'Gift Sets' };

function syncUrl() {
  const q = new URLSearchParams();
  if (state.category !== 'all') q.set('category', state.category);
  if (state.purity) q.set('purity', state.purity);
  if (state.search) q.set('search', state.search);
  if (state.sort !== 'newest') q.set('sort', state.sort);
  if (state.min) q.set('min', state.min);
  if (state.max) q.set('max', state.max);
  if (state.sale) q.set('sale', '1');
  const qs = q.toString();
  history.replaceState(null, '', '/shop' + (qs ? '?' + qs : ''));
}

async function loadCategories() {
  const { categories } = await CH.api('/api/categories');
  const total = categories.reduce((s, c) => s + c.count, 0);
  const wrap = CH.$('#catFilters');
  const row = (slug, name, count) => `<label class="filter-opt"><input type="radio" name="cat" value="${slug}" ${state.category === slug ? 'checked' : ''}> ${name} <span style="margin-left:auto;color:var(--faint);font-size:11px">${count}</span></label>`;
  wrap.innerHTML = row('all', 'All pieces', total) + categories.map(c => row(c.slug, c.name, c.count)).join('');
  wrap.addEventListener('change', (e) => {
    if (e.target.name !== 'cat') return;
    state.category = e.target.value; state.page = 1;
    titleEl.textContent = state.search ? `Search: ${state.search}` : (CAT_NAMES[state.category] || 'All Silver');
    syncUrl(); fetchProducts(true);
  });
}

function buildQuery() {
  const q = new URLSearchParams();
  if (state.category !== 'all') q.set('category', state.category);
  if (state.purity) q.set('purity', state.purity);
  if (state.search) q.set('search', state.search);
  q.set('sort', state.sort);
  if (state.min) q.set('min', state.min);
  if (state.max) q.set('max', state.max);
  if (state.inStock) q.set('inStock', '1');
  if (state.sale) q.set('sale', '1');
  q.set('limit', '12');
  q.set('page', String(state.page));
  return q.toString();
}

async function fetchProducts(reset) {
  if (reset) { state.page = 1; state.items = []; CH.skeletonGrid('#shopGrid', 8); }
  try {
    const data = await CH.api('/api/products?' + buildQuery());
    const items = Array.isArray(data.items) ? data.items : [];
    state.items = reset ? items : state.items.concat(items);
    state.total = Number(data.total || 0);
    CH.renderProductGrid('#shopGrid', state.items);
    countEl.textContent = `${state.total} result${state.total === 1 ? '' : 's'}${state.search ? ` for “${state.search}”` : ''}`;
    CH.$('#loadMoreBtn').style.visibility = (state.page * 12 < state.total) ? 'visible' : 'hidden';
  } catch (err) {
    grid.innerHTML = `<div class="empty-state shop-error" style="grid-column:1/-1"><h3>We couldn’t reach the live collection.</h3><p>${CH.escapeHTML(err.message || 'Please try again in a moment.')}</p><button type="button" class="btn btn-outline" id="retryShop">Try again</button></div>`;
    CH.$('#retryShop')?.addEventListener('click', () => fetchProducts(true));
    countEl.textContent = 'Catalogue connection unavailable';
  }
}

/* events */
sortSelect.value = state.sort;
sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; syncUrl(); fetchProducts(true); });

const minInput = CH.$('#minPrice'), maxInput = CH.$('#maxPrice');
minInput.value = state.min; maxInput.value = state.max;
let priceT = null;
const priceChanged = () => {
  clearTimeout(priceT);
  priceT = setTimeout(() => { state.min = minInput.value; state.max = maxInput.value; syncUrl(); fetchProducts(true); }, 350);
};
minInput.addEventListener('input', priceChanged);
maxInput.addEventListener('input', priceChanged);

CH.$('input[name="purity"]').forEach(input => {
  input.checked = input.value === state.purity;
  input.addEventListener('change', () => { state.purity = input.value; syncUrl(); fetchProducts(true); });
});

CH.$('#priceChips').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-min]'); if (!btn) return;
  minInput.value = btn.dataset.min === '0' ? '' : btn.dataset.min;
  maxInput.value = btn.dataset.max === '1000000' ? '' : btn.dataset.max;
  state.min = minInput.value; state.max = maxInput.value; syncUrl(); fetchProducts(true);
});
CH.$('#inStock').addEventListener('change', (e) => { state.inStock = e.target.checked; fetchProducts(true); });
CH.$('#onSale').addEventListener('change', (e) => { state.sale = e.target.checked; syncUrl(); fetchProducts(true); });
CH.$('#clearFilters').addEventListener('click', () => { window.location.href = '/shop'; });
CH.$('#loadMoreBtn').addEventListener('click', () => { state.page += 1; fetchProducts(false); });
CH.$('#filterToggle').addEventListener('click', () => CH.$('#filterPanel').classList.toggle('open'));

titleEl.textContent = state.search ? `Search: ${state.search}` : (CAT_NAMES[state.category] || 'All Silver');
if (state.sale) CH.$('#onSale').checked = true;
loadCategories().then(() => fetchProducts(true)).catch(err => {
  const wrap = CH.$('#catFilters');
  if (wrap) wrap.innerHTML = `<p class="filter-error">Filters unavailable: ${CH.escapeHTML(err.message || 'Catalogue connection failed.')}</p>`;
  fetchProducts(true);
});
