# Chandrahasa — UI and deployment package report

## Applied in this revision

- Premium oxblood, ivory and antique-gold visual system with locally hosted Cormorant Garamond and DM Sans fonts.
- Cleaner editorial hero, restrained borders/shadows, compact responsive catalogue cards, mobile bottom navigation and accessible keyboard focus states.
- Removed the camera-overlay virtual try-on UI and its client-side camera/canvas code.
- Added a Vercel Node serverless `/api/*` proxy using `CHANDRAHASA_API_URL`; no fake Render hostname is embedded in the frontend configuration.
- Enabled Vercel clean URLs so `.html` pages resolve at extensionless routes.
- Removed fabricated default star ratings, fake review distribution, placeholder HUIDs and generic fallback product images from product cards.
- Removed customer-facing demo gateway/coupon hints and replaced several unsupported hallmark, seller, contact and tax-invoice assertions with neutral wording.
- Production seed guard blocks the fictional demo seed script in production; explicit non-production opt-in is still required.
- Repaired the package audit script so it checks the split `frontend/` + `backend/` structure.

## Checks completed in this workspace

- `npm test`: 39 source/package checks passed, 0 failed.
- `npm run syntax`: passed.
- JavaScript syntax checks: passed for frontend scripts, Vercel API proxy and backend scripts.
- Local HTML link target scan: no missing local page/file targets found.
- Live website was previously inspected with TinyFish. The deployed site returned HTTP 404 for `/api/health` and extensionless shop/account/heritage/policies routes; `.html` pages were directly accessible. This package includes the clean-URL fix and environment-driven API proxy, but those changes have not yet been deployed to the live Vercel project.

## Not honestly claimable as complete

- No Vercel or Render deployment was performed from this workspace; no account authorization or production backend hostname was supplied.
- `CHANDRAHASA_API_URL` must be set in Vercel to the real backend origin.
- Backend currently uses SQLite (`better-sqlite3`), not a PostgreSQL runtime. Render must use a persistent disk if SQLite remains in use.
- Real catalogue data, product imagery, actual seller/legal details, GSTIN, return terms, contact details and provider credentials must be supplied/confirmed by the business owner. The UI no longer invents missing ratings or HUIDs, but an empty production database will correctly show an empty catalogue.
- Razorpay live payment/webhook/refund flows, Shiprocket account flows, production email, backups, concurrency/load testing and external security review were not run here.
- The backend runtime could not be started in this workspace because the installed `better-sqlite3` package was incomplete (`MODULE_NOT_FOUND` at runtime). Syntax/source tests are not runtime integration proof.

## Deploy settings

See `DEPLOYMENT-REQUIRED-SETTINGS.md` for exact Vercel and backend host settings. Do not announce the store as live/production-ready until `/api/health` works through the Vercel domain and provider/database release checks pass.
