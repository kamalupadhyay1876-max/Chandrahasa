# Chandrahasa — upgrade changelog (24 Nov 2026)

## Storefront design pass
- Added a final visual layer with softer rounded geometry, restrained oxblood/ivory/brass palette, consistent card/input/button radii, refined shadows, and responsive spacing.
- Preserved the existing editorial typography and reduced-motion behavior.
- Kept the visual changes CSS-only; no additional runtime dependency.

## Admin backup console
- Added a dedicated Database backups panel to the Business Control Room.
- Added admin UI wiring for listing backups and creating a verified online SQLite snapshot.
- Added accessible live status messages and disabled/loading state while creating a backup.
- Restore remains an offline maintenance command by design.

## Verification boundaries
- Backend static audit and source checks are run during packaging.
- SQLite native backup/restore runtime test could not run in this environment because `better-sqlite3` is not installed and `npm ci` timed out. Do not treat this as a successful restore drill.
- Docker build, Railway deploy, Razorpay/Shiprocket sandbox, and hosted end-to-end order verification remain pending.

## Advanced marketplace release upgrade

- Added HMAC-signed, idempotent seller KYC/bank provider webhook adapter.
- Added separately gated Razorpay Route transfer release for verified, delivered, captured seller sub-orders, including unknown-state protection and refund hold.
- Added seller-level sub-order grouping, default warehouse allocation, inventory reservation/fulfilment movements and seller inventory UI.
- Added CA-controlled GST/TCS working ledger, full-return adjustments and monthly CSV export.
- Added authenticated native WebSocket concierge chat with REST fallback.
- Added `MARKETPLACE-ADVANCED-RELEASE-UPGRADE-2026-11-24.md` and owner activation steps.
