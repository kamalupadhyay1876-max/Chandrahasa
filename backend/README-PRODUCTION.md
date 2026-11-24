# Chandrahasa — Client handover & setup

This package retains the original 925 sterling silver jewellery storefront and its local Node + SQLite commerce foundation, assets, 3D experience, admin tools and operations modules.

## Windows setup
1. Install Node.js 20 or newer.
2. Extract this ZIP, then copy `.env.example` to `.env`.
3. Edit `.env`: set a unique random `SECRET` (32+ characters). Keep `.env` private.
4. Run `setup_run.cmd` or in a terminal run `npm install` then `npm start`.
5. Open `http://localhost:3000`.

The launcher does not seed demo accounts automatically. For local demo data only, run `set ALLOW_SEED=1` then `npm run seed`. Remove demo accounts and sample content before production.

## Included modules
- Brand storefront, collection/shop, product details, search/catalog filtering, product imagery and 3D experience
- Cart, wishlist, guest/customer checkout experience and order lookup
- Customer signup/login, profile/account and password-reset flow
- Admin studio: catalogue, orders, coupons, customers, analytics
- Operations control room: categories, settings, contacts, newsletter, review moderation, audit log and fulfilment fields
- Contact, newsletter, heritage/story and policy pages
- SQLite storage, migrations/upgrades, REST API, scripts and test/audit documentation

## Important deployment limitations
**This is a handover candidate, not a certified production ecommerce release.** Online card payment verification is disabled fail-closed; no live Razorpay integration is present. Email reset delivery requires configured provider. Shipping carrier integration, automated tax/GST compliance, independent security review, load test, backup/restore test and legal policy review must be completed before public sale. SQLite is intended for a single instance; use a managed database architecture for multi-instance/high-traffic deployment. Do not expose demo accounts.

## Deployment
Run behind HTTPS/reverse proxy, set `NODE_ENV=production`, a unique `SECRET`, persistent `DATA_PATH`, database backups and restricted filesystem permissions. Do not place database files in ephemeral deployment storage. Do not assume Vercel serverless is suitable for this SQLite server; deploy to a persistent Node host or migrate to a managed database.

## Checks
- `npm run audit` — static source audit (not a penetration test)
- `npm test` — same static audit
- `npm run e2e` — browser smoke tests if compatible Playwright browser dependencies are installed

Read `docs/RELEASE-READINESS.md` and `README.md` before launch.


## Payment/shipping integration upgrade
See `docs/INTEGRATIONS-UPGRADE.md`. Razorpay Order API creation and Checkout signature verification are wired, and admin-only Shiprocket shipment creation/tracking endpoints are available. Live rollout remains gated: webhook reconciliation/refunds, accurate shipping weights, UI workflows and independent security review still require completion.


### Payments / shipment upgrade
Set `RAZORPAY_WEBHOOK_SECRET` from the Razorpay webhook configuration and register `/api/payments/webhook` for payment.captured, payment.failed and refund.processed events. Admin API includes reconciliation (`/api/admin/payments/reconcile`) and refund requests (`/api/admin/payments/refund`). Shiprocket payload derives weight from product weight strings; validate formats (grams) in the sandbox.


## Easier hosted deployment
- Render persistent-disk blueprint: `render.yaml` and `deploy/DEPLOY-RENDER.md`.
- Supabase optional catalogue Storage SQL is prepared under `supabase/migrations`; admin upload UI is not yet connected and SQLite remains the transactional database. See `deploy/SUPABASE.md`.
- Vercel is not suitable for this unchanged SQLite runtime without a database migration.

## Final handover additions
- `docs/FINAL-40-POINT-UPGRADE.md`: source-present feature inventory and remaining release gates.
- `docs/PRODUCTION-SETUP-CHECKLIST.md`: setup/deploy/client acceptance checklist.
- `docs/CLIENT-PITCH.md`: client-facing pitch, discovery, demonstration, package scope and objections.
- `docs/AMAZON-COMPARISON.md`: realistic comparison and roadmap priorities.
- `supabase/migrations/202611230000_core_postgres.sql`: core PostgreSQL schema draft for a future cutover. The runtime remains SQLite; this migration is not a completed cutover.

## Deployment support and Vercel incident

For the current Node HTTP + SQLite runtime, use a persistent Node host (Render with its disk, or Docker on a persistent-volume host). This runtime is not Vercel-serverless compatible: it starts its own HTTP listener and relies on persistent SQLite filesystem storage. See `docs/VERCEL-500-REMEDIATION.md` for the incident-specific explanation and migration path.

Run `npm run env:check` to inspect environment setup without printing secret values. This diagnostic checks configuration presence only; it does not test provider connectivity.
