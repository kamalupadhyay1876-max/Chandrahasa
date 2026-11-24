'use strict';
/* End-to-end smoke: guest bag → COD checkout → tokenized success page */
const path = require('path');
const { chromium } = require('playwright-core');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'shots');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--use-gl=swiftshader', '--enable-webgl', '--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('ch_cart', JSON.stringify([
      { productId: 1, slug: 'heart-pendant', name: 'Heart Pendant', price: 999, compare_price: 1499, image: '/assets/img/heart-pendant.jpg', huid: 'H120987', qty: 1, size: '' },
      { productId: 2, slug: 'floral-silver-ring', name: 'Floral Silver Ring', price: 1299, compare_price: 1899, image: '/assets/img/rings.webp', huid: 'H284193', qty: 1, size: '12' },
    ]));
    sessionStorage.setItem('ch_coupon', 'SILVER20');
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(BASE + '/checkout', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#coEmail', { timeout: 10000 });
  await page.waitForTimeout(800); // summary + coupon re-apply

  await page.fill('#coEmail', 'e2e.buyer@example.com');
  await page.fill('#coPhone', '+91 98123 45678');
  await page.fill('#coName', 'E2E Buyer');
  await page.fill('#coLine1', '41, Johari Bazaar');
  await page.selectOption('#coState', { index: 1 });
  await page.fill('#coPincode', '302003');
  await page.fill('#coCity', 'Jaipur');

  const total = await page.textContent('#sumTotal');
  console.log('• total before placing:', total);
  const discount = await page.textContent('#sumDiscount');
  console.log('• coupon discount line:', discount);

  await page.click('#placeOrderBtn');
  try {
    await page.waitForURL('**/success**', { timeout: 15000 });
  } catch (e) {
    console.log('• checkout URL after failure:', page.url());
    console.log('• checkout error:', await page.textContent('#checkoutError').catch(() => 'unavailable'));
    throw e;
  }
  await page.waitForTimeout(1600);
  const ordId = await page.textContent('#ordId');
  const payLine = await page.textContent('#ordPaymentLine');
  console.log('• SUCCESS page:', ordId, '—', payLine);
  await page.screenshot({ path: path.join(OUT, 'e2e-success.png') });
  console.log('• pageerrors:', errors.length ? errors.join(' | ') : 'none');
  console.log('E2E_ORDER_ID=' + (ordId || '').replace('#', ''));
  await browser.close();
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
