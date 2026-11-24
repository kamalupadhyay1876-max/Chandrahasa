'use strict';
/* Visual smoke test v2: screenshots + console errors + authed admin + mobile */
const path = require('path');
const { chromium } = require('playwright-core');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'shots');

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--no-sandbox'] });

  /* ── guest session ── */
  const guest = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await guest.newPage();
  const shoot = async (name, p, wait = 800, fullPage = false) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    try {
      await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(wait);
      await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage });
      console.log(`OK   ${name.padEnd(14)} errors=${errors.length}${errors.length ? ' :: ' + errors.slice(0, 3).join(' | ') : ''}`);
    } catch (err) {
      console.log(`FAIL ${name.padEnd(14)} ${err.message}`);
    }
  };
  await shoot('home', '/', 1400);
  await shoot('heritage', '/heritage', 1600);
  await shoot('contact', '/contact', 600);
  await shoot('policies', '/policies', 400);
  await shoot('404', '/no-such-page', 400);
  await shoot('shop', '/shop?category=rings', 900);
  await shoot('home-full', '/', 1400, true);
  await shoot('pdp', '/product?slug=oxidised-silver-bangle', 1200);
  await shoot('success', '/success?id=19&email=demo%40chandrahasa.com&method=razorpay', 1300);
  await guest.close();

  /* ── guest with a filled bag (localStorage) ── */
  const shopper = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await shopper.addInitScript(() => localStorage.setItem('ch_cart', JSON.stringify([
    { productId: 36, slug: 'heart-pendant', name: 'Heart Pendant', price: 999, compare_price: 1499, image: '/assets/img/heart-pendant.jpg', huid: 'H120987', qty: 1, size: '' },
    { productId: 29, slug: 'floral-silver-ring', name: 'Floral Silver Ring', price: 1299, compare_price: 1899, image: '/assets/img/rings.webp', huid: 'H284193', qty: 1, size: '12' },
  ])));
  const spage = await shopper.newPage();
  const serrors = [];
  spage.on('console', (m) => { if (m.type() === 'error') serrors.push(m.text()); });
  spage.on('pageerror', (e) => serrors.push('PAGEERROR: ' + e.message));
  await spage.goto(BASE + '/checkout', { waitUntil: 'networkidle', timeout: 30000 });
  await spage.waitForTimeout(900);
  await spage.screenshot({ path: path.join(OUT, 'checkout-filled.png') });
  console.log(`OK   checkout-filled errors=${serrors.length}${serrors.length ? ' :: ' + serrors.slice(0, 3).join(' | ') : ''}`);
  await shopper.close();

  /* ── admin session (login via API, carry the cookie) ── */
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await adminCtx.request.post(BASE + '/api/auth/login', { data: { email: 'admin@chandrahasa.com', password: 'Admin@123' } });
  const setCookie = login.headers()['set-cookie'] || '';
  const match = setCookie.match(/ch_session=([^;]+)/);
  if (match) {
    await adminCtx.addCookies([{ name: 'ch_session', value: match[1], domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  }
  const apage = await adminCtx.newPage();
  const aerrors = [];
  apage.on('console', (m) => { if (m.type() === 'error') aerrors.push(m.text()); });
  apage.on('pageerror', (e) => aerrors.push('PAGEERROR: ' + e.message));
  await apage.goto(BASE + '/admin', { waitUntil: 'networkidle', timeout: 30000 });
  await apage.waitForTimeout(1400);
  await apage.screenshot({ path: path.join(OUT, 'admin-authed.png') });
  console.log(`OK   admin-authed   errors=${aerrors.length}${aerrors.length ? ' :: ' + aerrors.slice(0, 3).join(' | ') : ''}`);
  // products tab
  await apage.click('[data-admin-tab="products"]');
  await apage.waitForTimeout(600);
  await apage.screenshot({ path: path.join(OUT, 'admin-products.png') });
  console.log('OK   admin-products');
  await adminCtx.close();

  /* ── demo customer session → account ── */
  const demoCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dlogin = await demoCtx.request.post(BASE + '/api/auth/login', { data: { email: 'demo@chandrahasa.com', password: 'Demo@123' } });
  const dcookie = (dlogin.headers()['set-cookie'] || '').match(/ch_session=([^;]+)/);
  if (dcookie) await demoCtx.addCookies([{ name: 'ch_session', value: dcookie[1], domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const dpage = await demoCtx.newPage();
  await dpage.goto(BASE + '/account', { waitUntil: 'networkidle', timeout: 30000 });
  await dpage.waitForTimeout(1000);
  await dpage.screenshot({ path: path.join(OUT, 'account.png'), fullPage: true });
  console.log('OK   account');
  await demoCtx.close();

  /* ── mobile viewport ── */
  const mob = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const mpage = await mob.newPage();
  await mpage.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await mpage.waitForTimeout(1200);
  await mpage.screenshot({ path: path.join(OUT, 'mobile-home.png') });
  await mob.close();
  console.log('OK   mobile-home');

  await browser.close();
})();
