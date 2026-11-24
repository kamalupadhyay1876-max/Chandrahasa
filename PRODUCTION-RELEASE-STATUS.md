# Chandrahasa production release status — 24 Nov 2026

## Completed in source package
- Single Railway Docker service architecture for frontend + API.
- SQLite persistent-volume configuration (`/data/chandrahasa.db`), single replica.
- Production secret gate, health endpoint with SQLite quick integrity check.
- Checkout idempotency and order/stock transaction safeguards retained.
- Shiprocket shipment reservation and payment reconciliation/refund workflows retained.
- SQLite online backup module, checksum and integrity verification, daily scheduler, admin-only list/create routes, and offline guarded restore script.
- Local source checks: Node syntax, 53 backend audit checks, 11 source checks.

## Not yet production-verified
- Current Railway production service has no deployment attached and no source connected. No live website is currently verified.
- Docker build and runtime boot with production dependencies have not been verified in this environment.
- Razorpay live merchant credentials/webhook, refund lifecycle and real settlement are not verified.
- Shiprocket credentials, label/AWB creation, cancellation and tracking are not verified.
- Full browser checkout and real end-to-end order lifecycle are not verified.
- Backup/restore script syntax is checked, but an actual SQLite backup/restore execution test could not run here because the local `better-sqlite3` native module is absent/incomplete.
- Same-volume scheduled backups are implemented; independent off-site backup storage and restore test remain a release gate.

## Launch decision
NOT APPROVED for live paid orders yet. The package is a deployment candidate, not a verified production store. Keep payment in test mode / disable paid checkout until live deployment, provider sandbox tests, backup/restore drill, and order-flow verification all pass.
