# Chandrahasa Split Deployment Package — Updated Handover

- Retained separate `frontend/` and `backend/` directories.
- Vercel config contains the API proxy rewrite template; backend hostname is still a placeholder.
- Added structural/syntax package check and deployment/upgrade reality documentation.
- Fixed malformed SQLite DDL for checkout idempotency table.
- Added session/reset/webhook/refund/audit indexes and groundwork tables for security events and notification outbox.
- Full present/pending inventory: `HIGH-SECURITY-STATUS.md`.

## Checks performed
- Backend JS syntax checks: PASS.
- Package structural/syntax checks: 30 PASS, 0 FAIL.
- ZIP integrity: must be checked on the generated archive.

## Critical limitations
- SQLite remains the active DB; PostgreSQL migration is not complete.
- Runtime SQLite initialization could not be executed because `better-sqlite3` is missing in this environment.
- Live Vercel/Render deployment, Razorpay/Shiprocket sandbox, refund reconciliation, MFA, distributed rate limiting, CSRF tokens, outbox workers, penetration testing, load testing and backup restore are not complete/verified.
- This is not a production security certification.
