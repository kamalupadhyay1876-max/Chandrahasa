# Chandrahasa — High-security feature status (2026-11-24)

This is an implementation inventory, not a security certification. “Present” means code/config/schema exists; it does not mean the feature has passed live or adversarial testing.

## Present in the source package
- Split frontend/backend project layout; Vercel API rewrite template; Render backend blueprint with persistent SQLite disk.
- Server-side API, parameterized SQLite statements, foreign-key enforcement, WAL mode, product price lookup on checkout, conditional stock decrement, coupon usage guarded inside checkout transaction.
- Password hashing with scrypt, random opaque session tokens stored as SHA-256 hashes, HttpOnly/SameSite cookies, session expiry lookup, password reset token hashing/expiry/one-time-use flow.
- Admin role checks on admin route group, admin audit-log table and write calls.
- Auth endpoint rate limits (in-memory, per-process); request JSON size ceiling; same-origin Origin check for unsafe API methods when Origin is supplied; static path traversal check.
- Response security headers, CSP for static pages, payment signature verification, webhook HMAC verification and event deduplication, conditional inventory release on payment failure, late-capture exception handling.
- Razorpay order initialization, payment verification endpoint, refund request route, Shiprocket shipment creation and tracking routes (provider integration code only).
- COD checkout idempotency cache (implementation is not transactionally reserved against simultaneous first requests).
- Added operational schema: security_events and notification_outbox tables, plus supporting indexes. These are groundwork only; no worker/alert delivery pipeline is connected.

## Changed in this handover
- Fixed malformed SQLite DDL for `checkout_idempotency` which otherwise prevents schema initialization when the DB dependency is present.
- Added indexes for session expiry/user lookup, password reset expiry, webhook/refund/audit lookup.
- Added `security_events` and `notification_outbox` schema primitives for future durable security/event handling.

## Not complete / not production verified
- PostgreSQL/Supabase cutover: NOT implemented; backend still uses synchronous better-sqlite3/SQLite.
- Admin MFA/passkeys, robust CSRF token strategy, distributed rate limiting, trusted-proxy IP handling, bot/WAF protection, account lockout/risk scoring, security alert delivery: NOT implemented end-to-end.
- Session rotation/revocation on password change, forced logout-all-devices, periodic cleanup jobs and session management UI: incomplete/not verified.
- Checkout idempotency atomic reservation for concurrent duplicate requests: incomplete; current COD cache can race on simultaneous first submissions.
- Payment verify route does not independently fetch gateway payment status/amount before marking paid; browser-return verification should not be the sole fulfillment authority. Webhook is intended authoritative but needs sandbox replay and edge-case tests.
- Webhook processing is not fully transactionally coupled to all event states; retry/dead-letter/alert worker is not connected.
- Refund lifecycle is not complete: no complete refund ledger reconciliation, partial/multiple refund cap enforcement proof, automated refund webhook reconciliation, customer refund portal or failure recovery workflow.
- Inventory reservation expiry/reaper, payment-init failure release, COD cancellation/restock lifecycle, returns/exchanges and warehouse-level inventory: incomplete.
- Shiprocket serviceability, rate quotes, pickup/manifest/label, NDR, reverse pickup, webhook updates and idempotent shipment creation: incomplete.
- Product image upload pipeline, malware/type validation, object storage integration and signed upload URLs: incomplete.
- Email/SMS/WhatsApp delivery, notification retry worker, invoice/PDF, tax/GST accounting and reconciliation reports: incomplete.
- Backups/restore automation, monitoring/alerting, log redaction, dependency audit, penetration test, load/concurrency tests and production provider tests: not completed.
- Actual Vercel/Render deployment and domain cutover: not performed. Replace placeholder backend hostname in `frontend/vercel.json`.

## Verification performed in this environment
- `node --check` on backend server/database/seed: PASS.
- `node backend/tests/split-package-check.js`: 30 PASS, 0 FAIL (structural and syntax checks only).
- Runtime SQLite initialization could not be executed because `better-sqlite3` is not installed in this environment.
- No live payment, shipping, production deployment, penetration or concurrency verification is claimed.

## Launch stance
Do not enable live prepaid checkout or accept live orders solely on the basis of this package. First install dependencies, run database/runtime and API tests, complete PostgreSQL decision/migration, close security release gates, configure real secrets, and complete Razorpay/Shiprocket sandbox plus backup-restore testing.
