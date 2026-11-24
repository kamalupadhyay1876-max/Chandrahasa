# Chandrahasa — High-Security Implementation Report

Date: 2026-11-24

## Changes implemented in this revision

- Added same-origin double-submit CSRF protection for all mutating `/api/*` routes, excluding the Razorpay webhook. The server issues a random 256-bit CSRF token through `/api/security/csrf`; the shared browser API client obtains it and sends `X-CSRF-Token`.
- Kept and strengthened origin-host validation for mutating API calls.
- Added explicit 413 handling for request bodies larger than 1 MB and 400 handling for malformed JSON instead of silently continuing with an empty body.
- Raised the minimum password length to 12 characters and bounded login password input to 128 characters. Password hashing remains scrypt.
- Payment verification now checks Razorpay's payment resource server-to-server and requires matching gateway order ID, exact INR amount, and captured status before marking the order paid.
- Duplicate payment verification returns an idempotent already-paid response.
- A `payment.failed` event no longer releases reserved inventory after a single failed instrument attempt. A Razorpay order can have another payment attempt; release must follow an explicit expiry/reconciliation decision.
- Refund requests reserve refundable balance transactionally before contacting Razorpay, reducing concurrent over-refund risk. Ambiguous gateway timeouts are recorded as `unknown` and must be reconciled rather than blindly retried.
- Refund webhook events now update refund records and calculate cumulative processed refund value before changing order/payment state.
- Added explicit timeouts to external Razorpay and Shiprocket requests.
- Added structural checks for CSRF, gateway payment verification, and refund lifecycle wiring.

## Checks run

- `node --check` on backend server, frontend shared API client, and package test file: PASS.
- `node backend/tests/split-package-check.js`: 33 passed, 0 failed.
- ZIP integrity: checked after packaging.

These are source/structure/syntax checks. They do not prove runtime behavior, security certification, or third-party integration success.

## Still not completed / not verifiable in this environment

1. PostgreSQL runtime migration: the active backend still imports `better-sqlite3` and uses SQLite-specific SQL. The Supabase SQL files are not a live PostgreSQL adapter. Do not point production traffic at PostgreSQL yet.
2. Checkout idempotency is not yet a fully atomic claim/lease/replay state machine for both COD and Razorpay. Current cached checkout idempotency is limited and concurrent same-key checkout is not certified.
3. Inventory reservation expiry/reaper and recovery worker are not implemented. Failed payment attempts intentionally do not auto-release stock; an operational expiry/reconciliation worker is required.
4. Notification outbox delivery worker, retry policy, dead-letter operations, and provider templates are not implemented end-to-end.
5. Admin MFA/passkeys, account recovery hardening, and security-event alerting are not implemented.
6. Distributed rate limiting is not implemented; current limiter is process-local and does not coordinate multiple instances.
7. Refund reconciliation polling/worker and operator exception workflow are not complete. An ambiguous timeout is safely marked `unknown`, but needs reconciliation before another refund attempt.
8. Shiprocket serviceability/rate lookup, AWB assignment, label generation, pickup scheduling, NDR, reverse pickup, and webhook lifecycle are not complete.
9. Secure media upload pipeline and durable object storage are not wired end-to-end.
10. Automated database backups, restore drills, monitoring/alerting, load testing, penetration testing, and disaster-recovery exercises are not completed.
11. Live deployment, DNS/domain setup, secrets configuration, Razorpay sandbox/live tests, and Shiprocket sandbox/live tests require owner credentials and access; none are claimed as done.

## Launch decision

**Not production-launch approved.** This revision materially improves request security, payment verification, and refund concurrency handling, but the remaining items above are real blockers. A feature is not marked complete merely because a route, table, or migration file exists.

## Required environment values

Set secrets only in the backend host's secret manager: `SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, and any configured email/storage provider credentials. Never put secret values in frontend files or commit `.env`.
