/* Chandrahasa — verify order before showing confirmation or certificate. */
'use strict';
const q=new URLSearchParams(window.location.search);
const orderId=q.get('id')||'';
const email=q.get('email')||'';
const method=q.get('method')||'cod';
const confirmationToken=q.get('token')||'';
const title=document.querySelector('.success-wrap h1');
const intro=document.getElementById('orderIntro');
const paymentLine=document.getElementById('ordPaymentLine');
const ring=document.querySelector('.success-ring');
const certificate=document.getElementById('certificate');
const timeline=document.getElementById('orderTimeline');
const canvas=document.getElementById('confettiCanvas');
const printButton=document.getElementById('printCertBtn');
function showUnverified(message){
  document.title='Order status unavailable — Chandrahasa';
  if(title)title.textContent='We could not verify this order';
  if(intro)intro.textContent=message;
  if(paymentLine)paymentLine.textContent='No payment or order status has been confirmed on this page.';
  if(ring)ring.hidden=true;if(certificate)certificate.hidden=true;if(timeline)timeline.hidden=true;
  if(canvas)canvas.hidden=true;if(printButton)printButton.hidden=true;
}
function startCheckAnimation(){requestAnimationFrame(()=>{const c=document.getElementById('drawCircle'),k=document.getElementById('drawCheck');if(c)c.style.strokeDashoffset='0';if(k)k.style.strokeDashoffset='0';});}
function startConfetti(){
  if(!canvas||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const ctx=canvas.getContext('2d');let w,h;const resize=()=>{w=canvas.width=window.innerWidth;h=canvas.height=window.innerHeight;};resize();window.addEventListener('resize',resize);
  const colors=['#d9c07a','#b8860b','#c0c0c0','#e8e2d5','#8f8f8f','#f6f1e8'];
  const parts=Array.from({length:130},()=>({x:Math.random()*w,y:-40-Math.random()*h*.6,w:5+Math.random()*8,h:8+Math.random()*14,vy:1.1+Math.random()*2.1,vx:(Math.random()-.5)*1.6,rot:Math.random()*Math.PI,vr:(Math.random()-.5)*.12,color:colors[Math.floor(Math.random()*colors.length)],sway:Math.random()*Math.PI*2}));
  let frames=0;(function tick(){frames++;ctx.clearRect(0,0,w,h);for(const p of parts){p.y+=p.vy;p.x+=p.vx+Math.sin((p.y+p.sway*100)*.02)*.6;p.rot+=p.vr;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.fillStyle=p.color;ctx.globalAlpha=.92;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore();}if(frames<540)requestAnimationFrame(tick);else ctx.clearRect(0,0,w,h);})();
}
document.addEventListener('DOMContentLoaded',()=>printButton?.addEventListener('click',()=>window.print()));
(async function verifyOrder(){
  if(!orderId||!/^[0-9]+$/.test(orderId)){showUnverified('No valid order reference was provided. Check your bag or open the confirmation link from your order email.');return;}
  try{
    const {order}=await CH.api(`/api/orders/${encodeURIComponent(orderId)}?token=${encodeURIComponent(confirmationToken)}`);
    if(!order||String(order.id)!==String(orderId))throw new Error('Order reference mismatch');
    document.title='Order confirmed — Chandrahasa';
    if(title)title.textContent='The bench is yours.';
    if(intro)intro.textContent=`Order #${order.id} confirmed — thank you, ${(order.address&&order.address.name)||'friend'}. A confirmation will be sent to ${order.email||email||'your inbox'}.`;
    if(paymentLine)paymentLine.textContent=method==='cod'?'Cash on delivery · Payment due at delivery · Insured transit':(order.payment_status==='paid'?'Payment verified · Insured transit':`Payment status: ${order.payment_status||'pending'} · Contact support if this does not update.`);
    if(certificate)certificate.hidden=false;if(timeline)timeline.hidden=false;
    const list=document.getElementById('certItems');
    const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    if(list)list.innerHTML=(order.items||[]).map(i=>`<li style="display:flex;justify-content:space-between;gap:14px;padding:4px 0;border-bottom:1px dashed var(--line)"><span>${esc(i.name)} × ${Number(i.qty)||0}</span><span style="color:var(--gold-deep);letter-spacing:.06em">HUID ${esc(i.huid||'—')}</span></li>`).join('')+`<li style="display:flex;justify-content:space-between;gap:14px;padding:8px 0 0;font-weight:700;color:var(--charcoal)"><span>Total ${order.payment_status==='paid'?'(paid)':''}</span><span>₹${Number(order.total).toLocaleString('en-IN')}</span></li>`;
    if(order.payment_status==='paid'||order.status!=='pending'){document.getElementById('tlConfirm')?.classList.add('done');startCheckAnimation();startConfetti();}else if(ring)ring.hidden=true;
  }catch{showUnverified(`We could not retrieve order #${orderId}. Do not treat this page as proof of payment. Check your order link or contact support with this reference.`);}
})();
