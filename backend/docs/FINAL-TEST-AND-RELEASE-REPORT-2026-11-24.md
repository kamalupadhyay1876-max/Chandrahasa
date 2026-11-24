# Chandrahasa — Verification report (24 Nov 2026)

## Scope
This report records tests actually executed in the available isolated environment against the recovered `Chandrahasa-Final-Verified-Upgrade.zip` source. It is not a production certification or an independent security audit.

## Executed results
- `python tests/browser-smoke.py`: **24 passed, 0 failed**. Constrained browser checks using `page.set_content()` rather than a full live-server E2E.
- `node scripts/audit.js`: **21 passed, 0 failed**. Static/source audit only.
- `node --check server.js`, `db.js`, `seed.js`: passed.
- npm CI dependency installation (`npm ci --no-audit --no-fund`): timed out in this environment; dependent server runtime tests were not executed.
- Package ZIP integrity: source archive integrity verified on recovery.

## Browser smoke details
- Homepage, product page, login page, heritage page at 390px and 1280px contexts.
- No horizontal overflow detected by the smoke harness in this run.
- No uncaught page errors detected in tested pages.
- Heritage WebGL failure fallback checked.

## TinyFish public URL check — scope warning
A TinyFish non-invasive browser run was made against `https://chandrahasa.com`. The observed site is a personal portfolio (not the jewellery storefront in this project), so it is **not evidence of this ecommerce application's live deployment** and must not be used as a deployment verification. No form was submitted and no account/payment/data actions were performed.

## Not verified / release blockers
- Server/API E2E, order creation and checkout against a running server.
- Database transaction, concurrent stock, oversell, coupon races and duplicate checkout tests.
- Full adversarial auth/IDOR/CSRF/XSS/SQLi testing.
- Admin MFA, distributed rate limiting, secrets audit in production, independent penetration test.
- Razorpay sandbox/live payment, webhook signature/replay, refund/reconciliation.
- Shiprocket sandbox, shipment idempotency, tracking/reverse pickup.
- Production deployment, HTTPS/TLS, backup/restore drill, monitoring, load test, legal/tax review.

## Release recommendation
Development/staging/demo use only. Keep online payments disabled and do not declare a production launch until the listed release gates are run in a production-like environment.
