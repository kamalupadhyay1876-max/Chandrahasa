# Chandrahasa live-site and dynamic-commerce comparison — 24 Nov 2026

## Live public site inspection
TinyFish inspected https://chandrahasa.com. The site is a personal portfolio (About, Skills, Timeline, Experience, Contact), not the jewellery ecommerce app in this repository. Visible dynamic features include rotating hero text, scroll animations/parallax and smooth-scroll navigation. Skills and Timeline appear empty. No commerce functionality was inspected because none was present.

## Repository tests rerun
- `python tests/browser-smoke.py`: 24 passed, 0 failed (constrained `page.set_content` harness, not real server navigation/API E2E).
- `node scripts/audit.js`: 21 passed, 0 failed (static/source checks).
- `node scripts/env-doctor.js`: exits nonzero in this environment because production configuration is absent; reports development mode, no configured secret, online payments disabled until keys, webhook secret and Shiprocket/email credentials optional/unconfigured.
- `better-sqlite3` and `playwright-core` are absent from current `node_modules`; real Node server E2E could not run.

## Source review findings (not runtime verified)
- Checkout reads product price and stock from the database, ignores submitted prices, and performs conditional stock decrement inside a SQLite transaction.
- No checkout idempotency key was evident in the reviewed order-creation route; duplicate client retries may create duplicate orders.
- Coupon validation/usage is not visibly reserved/validated atomically with coupon limit in the reviewed checkout route; concurrent checkouts may exceed the limit.
- In-memory rate limits are not shared across processes/instances and are not persistent.
- COD orders decrement inventory immediately and create order records; real server behavior remains untested.
- A dynamic admin route guard checks for user and `role === 'admin'`; full CSRF/MFA/IDOR adversarial tests remain unexecuted.
- Online payment, refund, webhook, shipment flows are not provider-certified or runtime-tested in this environment.

## Amazon comparison
This is a single-merchant storefront, not an Amazon marketplace. Amazon-scale services (seller onboarding, marketplace fraud, distributed inventory, fulfilment network, recommendation/search systems, large-scale returns/refunds, multi-region resilience, support tooling) are not present and cannot be meaningfully claimed as equivalent. Product/cart/account/checkout/admin UI and some commerce APIs are present in source, but those are not evidence of a reliable production transaction system.

## Release recommendation
Keep deployment in staging/demo and online payments disabled. Highest-priority engineering work: (1) checkout idempotency, (2) coupon-use race safety, (3) persistent/shared rate limiting, (4) real API/E2E runtime test environment, (5) auth/CSRF/MFA and ownership adversarial tests, (6) backup/restore and observability, (7) provider sandbox tests, and (8) domain/DNS deployment of the actual storefront.
