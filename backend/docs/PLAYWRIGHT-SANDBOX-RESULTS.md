# Browser smoke test report (sandbox)

**Run date:** 2026-11-23  
**Harness:** Python Playwright installed in the sandbox, system Chromium  
**Mode:** page markup loaded with `page.set_content()` and source CSS/JS injected; no localhost or external navigation permitted by the sandbox.

## Results

- 24 checks passed, 0 failed.
- Pages checked: homepage, product, login, heritage.
- Viewports: 390px mobile and 1280px desktop.
- Checks: renderable body content, horizontal overflow tolerance (<=24px), uncaught page errors on homepage/product/login.
- Product at 390px reports 24px measured document overflow; this is at the current test tolerance and should be rechecked in a real browser environment.
- The heritage 3D scene now catches WebGL initialization failure and inserts an accessible text fallback rather than leaving an uncaught error.

## Limitations

This is a sandbox markup/CSS/JS smoke test, not browser testing against a live server. Navigation to loopback/file URLs was blocked by the execution sandbox. API calls, authentication, checkout, SQLite, PostgreSQL, Razorpay, Shiprocket and real order flows were **not** exercised. Node `playwright-core` and `better-sqlite3` npm dependencies could not be installed in this sandbox (npm install timed out / exited abnormally); the Python Playwright runtime and Chromium were available for the constrained checks.

Run on a local/CI environment with server and dependencies available:

```bash
npm ci
npm run audit
npm run syntax
npm run e2e
# Python Playwright smoke
pip install playwright
playwright install chromium
npm run test:browser-smoke
```

## Re-run after mobile overflow fix
- 24 checks passed, 0 failed.
- Product detail page at 390px: horizontal overflow reduced to 0px.
- Tests remain constrained static markup/browser-injection checks; they do not represent live-server/API checkout/payment testing.
