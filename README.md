# Chandrahasa — Railway single-service package

**Start here:** read [`RAILWAY-DEPLOYMENT.md`](RAILWAY-DEPLOYMENT.md).

This repository is prepared for one Railway web service. Railway builds the root `Dockerfile`; the Node server serves the complete `frontend/` directory and handles `/api/*` on the same domain. You do not deploy the `frontend/` folder separately for this Railway setup.

- `frontend/` — storefront pages, CSS, fonts, images and browser scripts
- `backend/` — Node API, SQLite schema, authentication, orders, payment/shipping integrations
- `Dockerfile` — combined frontend + backend image
- `railway.json` — Railway build and health-check configuration
- `RAILWAY-DEPLOYMENT.md` — setup, volume, environment variables and release gates

The production database is SQLite on a Railway persistent volume. No fictional demo catalogue is inserted. Real inventory, merchant details and payment credentials must be configured before accepting orders.

Railway Free has $1 monthly resource credit and sleeps idle services. It is intended for preview/testing, not guaranteed always-on commercial production. See the deployment guide for current plan limits and official pricing links.


## Seller marketplace operations upgrade (24 Nov 2026)
See `SELLER-MARKETPLACE-COMPLETE-UPGRADE-2026-11-24.md` and `FINAL-SELLER-MARKETPLACE-DELIVERY-2026-11-24.md` for bulk catalogue CSV/API imports, per-seller Shiprocket accounts, seller performance metrics and configurable policy enforcement. Railway must have `SELLER_CARRIER_ENCRYPTION_KEY` configured before sellers connect carrier accounts.


Latest engineering pass: see `PRODUCTION-COMPLETION-ENGINEERING-PASS-2026-11-24.md` and `REMAINING-BLOCKERS.md` for verified source changes and remaining launch gates.
