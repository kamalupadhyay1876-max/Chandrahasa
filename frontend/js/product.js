/* Chandrahasa — product details, cart, wishlist, reviews and optional try-on */
'use strict';

const slug = new URLSearchParams(window.location.search).get('slug') || '';
if (!slug) { document.addEventListener('DOMContentLoaded', () => { const n=document.querySelector('#pdpName'); if(n)n.textContent='Choose a product from the collection'; const d=document.querySelector('#pdpDesc'); if(d)d.textContent='Open a product from the shop to view its current details.'; ['#addToBagBtn','#buyNowBtn'].forEach(s=>{const b=document.querySelector(s);if(b)b.disabled=true;}); }); }
const state = { product: null, qty: 1, size: null };

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const fmt = CH.money;

/* ── load product ── */
(async function load() {
  if (!slug) return;
  try {
    const { product, reviews, related } = await CH.api('/api/products/' + encodeURIComponent(slug));
    state.product = product;
    document.title = `${product.name} — Chandrahasa 925 Silver`;
    $('#pdpTitle') && ($('#pdpTitle').textContent = `${product.name} — Chandrahasa`);
    $('#crumbName').textContent = product.name;
    $('#crumbCat').href = '/shop?category=' + product.category_slug;
    $('#crumbCat').textContent = product.category_slug.replace('-', ' ');
    $('#pdpName').textContent = product.name;
    $('#pdpArtisan').textContent = product.artisan;
    $('#pdpPrice').textContent = fmt(product.price);
    const img = CH.safeImageUrl ? CH.safeImageUrl(product.images && product.images[0]) : '';
    const photo = $('#pdpPhoto'); if (img) { photo.src = img; photo.alt = product.name; photo.style.display = 'block'; } else { photo.removeAttribute('src'); photo.alt = 'Product image unavailable'; photo.style.display = 'none'; }
    $('#pdpBadge').textContent = product.badge || ''; $('#pdpBadge').hidden = !product.badge;
    $('#pdpDesc').textContent = product.description;
    $('#pdpWeight').textContent = product.weight;
    $('#huidCode').textContent = product.huid || 'Not provided';
    $('#pdpHuidInline').textContent = product.huid || 'Not provided';
    const huidCard = document.querySelector('.huid-card'); if (huidCard) huidCard.hidden = !product.huid;
    $('#artisanStory').textContent = product.artisan_story;
    $('#artisanName').textContent = product.artisan;
    if (product.compare_price && product.compare_price > product.price) {
      $('#pdpCompare').style.display = 'inline'; $('#pdpCompare').textContent = fmt(product.compare_price);
      $('#pdpOff').style.display = 'inline'; $('#pdpOff').textContent = Math.round((1 - product.price / product.compare_price) * 100) + '% off';
    }
    const hasReviews = Number(product.review_count) > 0 && Number.isFinite(Number(product.rating));
    $('#pdpStars').textContent = hasReviews ? '★'.repeat(Math.max(0, Math.min(5, Math.round(Number(product.rating))))) : '';
    $('#pdpRating').textContent = hasReviews ? `${Number(product.rating).toFixed(1)} · ${Number(product.review_count)} reviews` : 'No published reviews yet';
    $('#pdpStock').textContent = product.stock > 0 ? `In stock — only ${product.stock} left` : 'Sold out';
    $('#pdpStock').style.color = product.stock > 0 ? 'var(--success)' : 'var(--danger)';

    // size selector (rings only)
    const needsSize = product.category_slug === 'rings';
    $('#sizeBlock').style.display = needsSize ? 'block' : 'none';
    if (needsSize) {
      $('#sizeRow').innerHTML = [8, 10, 12, 13, 14, 16, 18, 20].map(s => `<button type="button" class="size-btn" data-size="${s}">${s}</button>`).join('');
      state.size = 12;
      $('#sizeRow').addEventListener('click', (e) => {
        const b = e.target.closest('[data-size]'); if (!b) return;
        state.size = Number(b.dataset.size);
        $$('.size-btn', $('#sizeRow')).forEach(x => x.classList.toggle('active', x === b));
      });
      $('[data-size="12"]', $('#sizeRow'))?.classList.add('active');
    }

    renderReviews(reviews, product);
    CH.renderProductGrid('#relatedGrid', related);
    await mountProductQuestions();
  } catch (err) {
    $('#pdpName').textContent = 'This piece could not be found.';
    $('#pdpDesc').textContent = 'It may have sold out or the link is old. Explore the current collection instead.';
    $('#addToBagBtn').disabled = true; $('#buyNowBtn').disabled = true;
  }
})();

/* ── qty + purchase ── */
$('#qtyDec').addEventListener('click', () => { state.qty = Math.max(1, state.qty - 1); $('#qtyVal').textContent = state.qty; });
$('#qtyInc').addEventListener('click', () => { const cap = state.product ? Math.min(10, state.product.stock) : 10; state.qty = Math.min(cap, state.qty + 1); $('#qtyVal').textContent = state.qty; });

function purchasePayload() {
  const p = state.product;
  return {
    productId: p.id, qty: state.qty, size: state.size ? String(state.size) : '',
    name: p.name, price: p.price, image: p.images && p.images[0] || '', huid: p.huid || '', stock: p.stock,
  };
}
$('#addToBagBtn').addEventListener('click', async () => {
  if (!state.product) return;
  try { await CH.addToCart(purchasePayload()); CH.toast(`Added to your bag — ${state.product.name}`); CH.openCart(); }
  catch (e) { CH.toast(e.message); }
});
$('#buyNowBtn').addEventListener('click', async () => {
  if (!state.product) return;
  try { await CH.addToCart(purchasePayload()); window.location.href = '/checkout'; }
  catch (e) { CH.toast(e.message); }
});
$('#pdpWishlist').addEventListener('click', async (e) => {
  if (!state.product) return;
  const btn = e.currentTarget;
  if (!window.CH_STATE || !CH_STATE.user) { CH.toast('Sign in to save pieces to your wishlist ✦'); return; }
  try {
    const data = await CH.api('/api/wishlist', { body: { productId: state.product.id } });
    btn.classList.toggle('active', data.wishlisted); btn.setAttribute('aria-pressed', String(data.wishlisted));
    CH.toast(data.wishlisted ? 'Saved to your wishlist ✦' : 'Removed from wishlist.');
  } catch (err) { CH.toast(err.message); }
});

/* ── accordion ── */
$$('.acc-head').forEach(btn => btn.addEventListener('click', () => {
  const item = btn.closest('.acc-item');
  item.classList.toggle('open');
  btn.setAttribute('aria-expanded', String(item.classList.contains('open')));
}));

/* ── modals ── */
$('#sizeGuideBtn').addEventListener('click', () => $('#sizeGuideModal').classList.add('open'));
$$('[data-close-modal]').forEach(b => b.addEventListener('click', () => b.closest('.lightbox').classList.remove('open')));
$$('.lightbox').forEach(lb => lb.addEventListener('click', e => { if (e.target === lb) lb.classList.remove('open'); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.lightbox.open').forEach(lb => lb.classList.remove('open')); });

/* ── reviews ── */
let pickedRating = 5;
function starString(r) { return '★'.repeat(r) + '☆'.repeat(5 - r); }
function renderReviews(reviews, product) {
  $('#avgRating').textContent = (product.rating || 0).toFixed(1);
  $('#avgStars').textContent = product.review_count > 0 ? starString(Math.max(0, Math.min(5, Math.round(Number(product.rating) || 0)))) : '';
  $('#reviewCount').textContent = product.review_count;
  const counts = [0, 0, 0, 0, 0];
  reviews.forEach(r => { counts[Math.min(5, Math.max(1, r.rating || 5)) - 1]++; });
  const total = reviews.length;
  const max = Math.max(1, ...counts);
  $('#ratingBars').innerHTML = [5, 4, 3, 2, 1].map(s => `<div style="display:flex;align-items:center;gap:8px;margin:3px 0"><span style="width:10px">${s}</span><div class="ship-bar" style="flex:1"><i style="width:${(counts[s - 1] / max) * 100}%"></i></div><span style="color:var(--faint);width:28px;text-align:right">${counts[s - 1]}</span></div>`).join('')
    + `<div style="font-size:10px;color:var(--faint);margin-top:6px;letter-spacing:.06em">Distribution of ${total} published reviews</div>`;
  const list = $('#reviewList');
  if (!reviews.length) {
    list.innerHTML = '<div class="empty-state" style="border:none;padding:26px 10px">Be the first to wear this piece — your review guides the next owner.</div>';
    return;
  }
  list.replaceChildren();
  reviews.slice(0, 6).forEach(r => {
    const article=document.createElement('article'); article.className='review-item';
    const head=document.createElement('div'); head.style.cssText='display:flex;justify-content:space-between;gap:12px;align-items:baseline';
    const author=document.createElement('b'); author.style.cssText='font-size:13px;color:var(--charcoal)'; author.textContent=String(r.author||'Verified customer');
    const date=document.createElement('span'); date.style.cssText='font-size:11px;color:var(--faint)';
    const parsedDate=new Date(String(r.created_at||'')+'Z'); date.textContent=Number.isNaN(parsedDate.getTime())?'':parsedDate.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
    head.append(author,date);
    const stars=document.createElement('div'); stars.className='stars'; stars.style.margin='4px 0'; stars.textContent=starString(Math.max(1,Math.min(5,Number(r.rating)||5)));
    article.append(head,stars);
    if(r.title){const title=document.createElement('b');title.style.cssText='font-size:13.5px;color:var(--ink)';title.textContent=String(r.title);article.append(title);}
    const body=document.createElement('p');body.style.cssText='font-size:13.5px;color:var(--soft-ink);margin-top:4px';body.textContent=String(r.body||'');article.append(body);list.append(article);
  });
}
$('#writeReviewBtn').addEventListener('click', () => {
  if (!CH_STATE.user) { CH.toast('Sign in to write a review ✦'); setTimeout(() => { window.location.href = '/login?next=' + encodeURIComponent('/product?slug=' + slug); }, 900); return; }
  const form = $('#reviewForm');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
});
$('#starPick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-star]'); if (!b) return;
  pickedRating = Number(b.dataset.star);
  $$('[data-star]', $('#starPick')).forEach(x => x.classList.toggle('active', x === b));
});
$('#reviewForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('#reviewTitle').value.trim(), body = $('#reviewBody').value.trim();
  try {
    await CH.api('/api/products/' + encodeURIComponent(slug) + '/reviews', { body: { rating: pickedRating, title, body } });
    CH.toast('Thank you — your review is live ✦');
    $('#reviewForm').reset(); $('#reviewForm').style.display = 'none';
    const { product, reviews } = await CH.api('/api/products/' + encodeURIComponent(slug));
    renderReviews(reviews, product);
  } catch (err) { CH.toast(err.message); }
});


/* Product Q&A + compare entry point. Mount only after product API resolves. */
async function mountProductQuestions(){
  if(!state.product || document.querySelector('[data-product-questions]')) return;
  const host=document.createElement('section');host.className='feature-panel';host.dataset.productQuestions='true';
  host.style.cssText='margin:28px 0;padding:22px;border:1px solid var(--line,#e8dfd4);border-radius:18px';
  const heading=document.createElement('h2');heading.textContent='Questions about this piece';heading.style.cssText='font-family:var(--font-display,Georgia);font-size:24px';
  const form=document.createElement('form');form.id='questionForm';form.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:12px 0';
  const input=document.createElement('input');input.name='question';input.minLength=8;input.maxLength=700;input.required=true;input.placeholder='Ask about size, material or care';input.setAttribute('aria-label','Your product question');input.style.cssText='flex:1;min-width:220px;padding:12px;border:1px solid #ddd;border-radius:10px';
  const submit=document.createElement('button');submit.className='btn btn-dark';submit.type='submit';submit.textContent='Ask a question';form.append(input,submit);
  const list=document.createElement('div');list.id='questionList';list.setAttribute('aria-live','polite');
  const compare=document.createElement('button');compare.className='btn btn-outline';compare.id='comparePiece';compare.type='button';compare.style.marginTop='12px';compare.textContent='Add to compare';
  const status=document.createElement('p');status.id='questionStatus';status.setAttribute('role','status');
  host.append(heading,form,list,compare,status);
  if(state.product.seller?.id){const sellerBox=document.createElement('div');sellerBox.style.cssText='margin-top:22px;padding-top:18px;border-top:1px solid var(--line,#e8dfd4)';const sellerTitle=document.createElement('h3');sellerTitle.textContent='Ask the artisan / seller';sellerTitle.style.cssText='font-family:var(--font-display,Georgia);font-size:20px';const sellerForm=document.createElement('form');sellerForm.style.cssText='display:grid;gap:9px;margin-top:10px';const subject=document.createElement('input');subject.name='subject';subject.required=true;subject.maxLength=120;subject.placeholder='Question about this piece';const message=document.createElement('textarea');message.name='message';message.required=true;message.minLength=10;message.maxLength=1500;message.placeholder='Ask about materials, sizing, dispatch or care';message.style.cssText='min-height:85px;padding:12px;border:1px solid #ddd;border-radius:10px';const send=document.createElement('button');send.className='btn btn-dark';send.type='submit';send.textContent='Send seller inquiry';const note=document.createElement('p');note.setAttribute('role','status');sellerForm.append(subject,message,send,note);sellerBox.append(sellerTitle,sellerForm);host.append(sellerBox);sellerForm.addEventListener('submit',async e=>{e.preventDefault();if(!CH_STATE.user){note.textContent='Please sign in before messaging the seller.';return;}send.disabled=true;try{await CH.api('/api/seller/inquiries',{body:{sellerId:state.product.seller.id,productId:state.product.id,subject:subject.value,message:message.value}});note.textContent='Inquiry sent. Seller replies will appear in your account.';sellerForm.reset();}catch(x){note.textContent=x.message||'Could not send inquiry.';}finally{send.disabled=false;}});}
  const related=document.querySelector('#relatedGrid');(related?.parentElement||document.querySelector('main'))?.append(host);
  async function loadQ(){
    const d=await CH.api('/api/questions?productId='+encodeURIComponent(state.product.id));list.replaceChildren();
    if(!(d.questions||[]).length){const empty=document.createElement('p');empty.textContent='No published questions yet. Be the first to ask.';empty.style.color='#81776e';list.append(empty);return;}
    (d.questions||[]).forEach(q=>{const article=document.createElement('article');article.style.cssText='padding:12px 0;border-top:1px solid #eee';const question=document.createElement('b');question.textContent='Q. '+String(q.question||'');const answer=document.createElement('p');answer.textContent=String(q.answer||'Awaiting an answer from our team.');article.append(question,answer);list.append(article);});
  }
  try{await loadQ()}catch{const error=document.createElement('p');error.textContent='Questions are temporarily unavailable.';list.append(error);}
  form.addEventListener('submit',async e=>{e.preventDefault();if(submit.disabled)return;submit.disabled=true;status.textContent='Submitting…';try{await CH.api('/api/questions',{body:{productId:state.product.id,question:input.value.trim()}});status.textContent='Question submitted for review.';form.reset();}catch(x){status.textContent=x.message||'Could not submit your question.';}finally{submit.disabled=false;}});
  compare.addEventListener('click',()=>{let ids=[];try{ids=JSON.parse(localStorage.getItem('ch_compare')||'[]')}catch{};if(!ids.includes(state.product.id))ids.push(state.product.id);ids=ids.slice(-4);localStorage.setItem('ch_compare',JSON.stringify(ids));location.href='/compare?ids='+ids.join(',')});
}
