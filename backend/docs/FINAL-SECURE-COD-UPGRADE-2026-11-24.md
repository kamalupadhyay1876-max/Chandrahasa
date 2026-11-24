# Chandrahasa — final handover / Secure COD code upgrade

## Code changes in this handover
- Added a SQLite `checkout_idempotency` cache table.
- COD checkout accepts an `Idempotency-Key` header (or `idempotencyKey` body value) with validation; repeat requests with the same key return the cached checkout response instead of creating another order.
- Coupon redemption increments are now conditional and guarded by active state and usage limit within the order transaction. A failed coupon reservation aborts the transaction.
- Retained server-side product pricing and conditional stock decrement.

## Verification performed
- `node scripts/audit.js`: 21 checks passed.
- `python tests/browser-smoke.py`: 24 checks passed in its constrained static page harness, including 390px and 1280px rendering checks.
- `node --check server.js` and `node --check db.js`: passed after code changes.
- `node scripts/env-doctor.js`: configuration gate reports development mode and no production secret/credentials; exits nonzero until production configuration is provided.

## Not verified / launch gates
- Actual SQLite-backed server startup, API checkout, duplicate idempotency replay, coupon concurrency and stock concurrency were not executed because dependency installation timed out and `better-sqlite3`/browser runtime dependencies are not available.
- Razorpay sandbox/live transactions, webhook validation/replay, refunds, Shiprocket, SMTP, admin MFA/CSRF, external penetration testing and production deployment are not verified.
- `chandrahasa.com` was previously inspected and was serving a portfolio, not this ecommerce app. This ZIP does not deploy or change the live domain.

## Run
1. Extract the ZIP.
2. Run `setup_run.cmd` on Windows or `npm install` then `npm start`.
3. Configure `.env` using `.env.example`; use a unique `Idempotency-Key` for each checkout attempt and reuse that key only for retries of the same attempt.
4. Use COD/test mode until provider credentials and deployment gates are validated.

This is a code-upgraded handover, not a claim of production certification.
