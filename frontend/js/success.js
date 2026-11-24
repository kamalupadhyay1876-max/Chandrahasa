/* Chandrahasa — order success: certificate render + confetti shower */
'use strict';

const q = new URLSearchParams(window.location.search);
const orderId = q.get('id'), email = q.get('email') || '';
const method = q.get('method') || 'cod';
const confirmationToken = q.get('token') || '';

/* animated check draw */
requestAnimationFrame(() => {
  const c = document.getElementById('drawCircle'), k = document.getElementById('drawCheck');
  if (c) c.style.strokeDashoffset = '0';
  if (k) k.style.strokeDashoffset = '0';
});

/* fill order details */
(async function fill() {
  if (!orderId) return;
  try {
    const { order } = await CH.api(`/api/orders/${orderId}?token=${encodeURIComponent(confirmationToken)}`);
    document.getElementById('ordId').textContent = '#' + order.id;
    document.getElementById('ordName').textContent = (order.address && order.address.name) || 'friend';
    document.getElementById('ordEmail').textContent = order.email;
    document.getElementById('ordPaymentLine').textContent = method === 'cod'
      ? 'Cash on delivery · Keep exact change ready · Insured transit'
      : 'Payment verified · Insured transit · 2–7 days';
    document.getElementById('certItems').innerHTML = (order.items || []).map(i =>
      `<li style="display:flex;justify-content:space-between;gap:14px;padding:4px 0;border-bottom:1px dashed var(--line)"><span>${i.name} × ${i.qty}</span><span style="color:var(--gold-deep);letter-spacing:.06em">HUID ${i.huid || '—'}</span></li>`).join('')
      + `<li style="display:flex;justify-content:space-between;gap:14px;padding:8px 0 0;font-weight:700;color:var(--charcoal)"><span>Total ${order.payment_status === 'paid' ? '(paid)' : ''}</span><span>₹${Number(order.total).toLocaleString('en-IN')}</span></li>`;
    if (order.payment_status === 'paid' || order.status !== 'pending') {
      const tl = document.getElementById('tlConfirm'); if (tl) tl.classList.add('done');
    }
  } catch {
    document.getElementById('ordId').textContent = '#' + orderId;
  }
})();

document.getElementById('printCertBtn')?.addEventListener('click', () => window.print());

/* ── confetti — hand-rolled, gold & silver petals ── */
(function confetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H;
  const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
  resize(); window.addEventListener('resize', resize);
  if (reduce) return;
  const COLORS = ['#d9c07a', '#b8860b', '#c0c0c0', '#e8e2d5', '#8f8f8f', '#f6f1e8'];
  const parts = Array.from({ length: 130 }, () => ({
    x: Math.random() * window.innerWidth,
    y: -40 - Math.random() * window.innerHeight * 0.6,
    w: 5 + Math.random() * 8, h: 8 + Math.random() * 14,
    vy: 1.1 + Math.random() * 2.1, vx: (Math.random() - 0.5) * 1.6,
    rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.12,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    sway: Math.random() * Math.PI * 2,
  }));
  let frames = 0;
  (function tick() {
    frames++;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.y += p.vy; p.x += p.vx + Math.sin((p.y + p.sway * 100) * 0.02) * 0.6; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.globalAlpha = 0.92;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (frames < 60 * 9) requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H);
  })();
})();
