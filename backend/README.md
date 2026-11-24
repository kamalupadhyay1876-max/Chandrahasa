# Chandrahasa — Full-stack jewellery storefront

Responsive 925 sterling silver e-commerce experience inspired by the supplied Figma reference. Includes live interactive 3D jewellery, product catalog and detail pages, guest/server cart, wishlist, coupons, checkout, customer authentication and order tracking, contact/newsletter forms, heritage story, and role-protected admin studio.

## Quick setup

Requirements: Node.js 20+ and npm.

```bash
cd chandrahasa
cp .env.example .env
```

Edit `.env` and replace `SECRET` with a unique random value (32+ characters). Then install, seed the demo database, and start:

```bash
npm ci
node seed.js
npm start
```

Open `http://localhost:3000`.

To regenerate the **demo** database (this deletes saved demo orders and users, then recreates them):

```bash
node seed.js --fresh
```

## Demo accounts

- Admin: `admin@chandrahasa.com` / `Admin@123`
- Customer: `demo@chandrahasa.com` / `Demo@123`

Change/remove these accounts and all sample data before opening a public store.

## Configure before deployment

- Set `NODE_ENV=production` and a unique `SECRET` (the server refuses to start in production with an example/default secret).
- Use HTTPS behind a properly configured production web server/proxy; set secure deployment, backups, logging, and monitoring.
- **Payments are a demo simulation, not live payment processing.** Before accepting money, integrate and test Razorpay using merchant credentials and their official order/signature flow. Do not use the demo payment credentials as real payment processing.
- Set `RESEND_API_KEY` and `MAIL_FROM` to enable password-reset emails; without email configuration, reset is development-only.
- Review legal, tax, shipping, returns, product, and hallmark claims for your actual business.
- SQLite is suitable for a small single-instance deployment; plan managed backups and consider a managed database for multi-instance/high-traffic operation.

`.env.example` lists supported settings. The app loads `.env` automatically without overriding environment-provided values. Database path defaults to `./data/chandrahasa.db`.

## Smoke tests

```bash
node scripts/shoot.js  # browser page screenshots → shots/
node scripts/e2e.js    # test checkout → simulated gateway → confirmation
```

Set `BASE_URL` to test a different server. Browser verification scripts require a compatible Chromium installation; they are optional for runtime.

## Final release handover documents
See `docs/PRODUCTION-SETUP-CHECKLIST.md`, `docs/FINAL-40-POINT-UPGRADE.md`, `docs/CLIENT-PITCH.md`, and `docs/AMAZON-COMPARISON.md`. The Supabase/PostgreSQL schema drafts are not connected to the current SQLite runtime. See `docs/SUPABASE-POSTGRES-MIGRATION-STATUS.md` before choosing a production host.

## Deployment notes

Current runtime is Node HTTP + SQLite. Use a persistent-volume host or Docker host, not a serverless Vercel function. Incident guidance: `docs/VERCEL-500-REMEDIATION.md`. Client credential handoff: `docs/DEPLOYMENT-CLIENT-READY.md`. Run `npm run env:check` to check configuration presence (it never prints secret values).
