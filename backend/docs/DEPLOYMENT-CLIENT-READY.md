# Deployment and client credential handoff

## Current architecture and safe deployment target

This delivery preserves the Node HTTP + SQLite application. The supported production deployment for this runtime is a persistent Node host such as Render with a mounted disk, or the Docker image on a host with persistent volume. Vercel serverless is not supported by the current runtime because the process starts its own HTTP listener and the database is synchronous SQLite on filesystem storage.

## Client setup: secrets only in host environment

The client should add credentials to the hosting provider's environment-variable panel (or a protected secret manager), not to the public source repository. Local `.env` is ignored by Git.

Required for production:
- `NODE_ENV=production`
- `SECRET`: random 32+ character secret, never reuse the sample
- `DATA_PATH`: persistent disk location, e.g. `/var/data/chandrahasa.db`

Optional provider integrations:
- Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- Shiprocket: `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`
- Resend email: `RESEND_API_KEY`, `MAIL_FROM`
- Supabase Storage (currently not wired for catalog uploads): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, service-role key must never be browser-exposed

**Never add secrets to frontend JS, commits, screenshots or client-visible documentation.**

## Before accepting real orders

- Verify admin access is limited to intended accounts and remove demo/test accounts.
- Confirm policies, return terms, privacy notice, shipping and tax settings with the business.
- Test successful payment, failed payment, duplicate webhook, refund, COD and shipping retry in provider sandbox.
- Confirm persistent-disk backup and restore.
- Perform a security review and run accessibility/performance checks.
- Do not enable live payments until race and replay tests have passed against the production database architecture.
