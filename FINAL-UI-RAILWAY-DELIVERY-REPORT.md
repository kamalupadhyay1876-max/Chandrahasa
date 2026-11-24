# Chandrahasa — final UI + Railway package report

## Implemented in this package

- Single Railway Docker deployment: one Node service serves frontend files and same-origin `/api/*`.
- Root `Dockerfile` builds backend dependencies and copies the frontend into `/app/public`.
- `railway.json` configures Docker build, `/api/health` health check and restart policy.
- SQLite data path configured for a Railway persistent volume at `/data/chandrahasa.db`.
- Added a one-time secure first-admin bootstrap script; it never promotes an existing customer and refuses to create a second admin.
- Refined visual system to restrained oxblood, warm ivory and antique brass; responsive header/search, buttons, cards, footer, mobile layout, focus and reduced-motion styling.
- Converted five large PNG assets (hero and four category images) to WebP and updated frontend/seed references. This materially reduces image payload size.
- Removed Vercel proxy dependency from the Railway deployment path. Frontend and API use the same origin.
- Preserved real-data-only production behavior: no demo seed is run in production.

## Local checks

- All frontend and backend JavaScript files passed `node --check`.
- `railway.json` and package JSON parsed successfully.
- Local HTML references were scanned for missing local page/file targets.
- Image references were scanned after WebP conversion.
- ZIP archive integrity checked.

## Not verified / owner actions

- No deployment was made in the user's Railway account.
- No live Railway domain or persistent volume was provisioned.
- Backend runtime and native `better-sqlite3` installation need a successful Railway Docker build to verify.
- Database remains SQLite, not PostgreSQL.
- No real product catalogue/business data or provider credentials were supplied.
- No live Razorpay, Shiprocket, email, refund or webhook tests were possible.
- Production security review, load testing, backup/restore drills and monitoring setup remain release gates.
- Railway Free has $1/month usage credit and sleeping services; it is not appropriate to promise always-on production availability.

## Release statement

This is a Railway-configured, deployable source package, not a live deployed or production-certified store. Do not take real payments until owner data, persistent storage, payment/shipping integrations and runtime checks have passed.
