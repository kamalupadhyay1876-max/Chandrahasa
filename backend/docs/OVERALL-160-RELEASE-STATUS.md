# Chandrahasa overall 160-point release status

This is a release tracker, not a claim that every item is a defect. Statuses are evidence-based.

## Completed in this update

- Added sandbox browser smoke harness: `tests/browser-smoke.py`.
- Added npm script `test:browser-smoke`.
- Added CI workflow steps to install Python Playwright/Chromium and run the browser smoke harness.
- Added graceful fallback in the heritage 3D journey when WebGL setup fails.
- Ran the sandbox browser smoke suite: **24 pass, 0 fail**, across 390px and 1280px markup contexts for homepage, product, login and heritage.
- Ran `node scripts/audit.js`: **21 pass, 0 fail**.
- Ran syntax checks across public JavaScript files and vendor JavaScript.

## Not completed / blocked by sandbox or external credentials

### P0 commerce safety
- Full synchronous SQLite application runtime port to PostgreSQL: **not done**.
- Supabase runtime connection and production cutover: **not done**.
- Atomic stock reservation across the complete application flow: **not done/verified**.
- Full stock/payment/refund/shipping state machines and durable workers: **not done/verified**.
- Razorpay sandbox/webhook/refund/concurrency tests: **not executed**.
- Shiprocket sandbox/retry/webhook tests: **not executed**.
- Backup and restore drill: **not executed**.

### Security and production verification
- Independent penetration test: **not performed**.
- Comprehensive RBAC/MFA/CSRF/rate-limit/PII review: **not completed**.
- Production/staging deployment, DNS/TLS, uptime and monitoring: **not performed**.
- Legal and tax review of client policies/GST content: **not performed**.

### Browser/API tests
- Browser test against a running server: **blocked**; sandbox prohibited navigation to loopback and file URLs.
- Node npm dependency install: **blocked** by timeout/abnormal npm exit. This left `better-sqlite3` and Node `playwright-core` unavailable in the sandbox. Python Playwright and system Chromium were used only for the restricted smoke test.
- Full API, authentication, checkout, payment and order tests: **not executed**.

## Release decision

**Do not enable real payments or customer order traffic yet.** This project remains a development/demo candidate. P0 items require actual implementation and provider-backed tests before production release.

## Final package update (2026-11-23)
- Fixed the product-detail mobile overflow caused by the non-wrapping 3D/Photo/Live Try-On controls; the controls now wrap at narrow viewport widths and the mobile browser test reports 0px horizontal overflow at 390px.
- Added `scripts/verify-package.py` to verify that every eligible project file is present in the release archive and matches its SHA-256 content hash.
- Release archive integrity and file-by-file matching are verified when this script passes.
