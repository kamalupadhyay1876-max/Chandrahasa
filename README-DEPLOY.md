# Chandrahasa — Railway single-service deployment

This package is configured for **one Railway service** that serves both the storefront and the Node.js API from the same origin.

## Runtime architecture

- Runtime: Node.js 20
- HTTP server: `backend/server.js`
- Frontend: `frontend/`, copied into the backend's `public/` directory by the root `Dockerfile`
- Database: SQLite via `better-sqlite3`
- Persistent database file: `/data/chandrahasa.db`
- Persistent storage: Railway Volume mounted at `/data`
- Replicas: exactly one (SQLite file locking and Railway volume are not a multi-writer / multi-region database)
- Health check: `/api/health`

**Do not configure `DATABASE_URL` or PostgreSQL and assume it is active.** This codebase has synchronous SQLite queries across the server. PostgreSQL would require a full async database-layer and route migration, not just an environment variable. This deployment deliberately retains SQLite with a persistent volume.

## Railway service settings

Repository root must be the directory containing this `Dockerfile` and `railway.json`.

- Builder: Dockerfile
- Dockerfile path: `Dockerfile`
- Start command: `node server.js`
- Health check path: `/api/health`
- Volume mount: `/data`
- Replicas: 1, one region only

Required environment variables:

```env
NODE_ENV=production
PORT=3000
DATA_PATH=/data/chandrahasa.db
SECRET=<unique-random-secret-at-least-32-characters>
```

Railway supplies `PORT` automatically; the server listens on it. Do not commit secrets to Git.

Optional provider credentials (keep blank until the merchant's accounts are verified):

```env
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=
SHIPROCKET_PICKUP_LOCATION=Primary
RESEND_API_KEY=
MAIL_FROM=
SENTRY_DSN=
```

## Deploy and verify

1. Connect the repository containing this project root to the Railway `chandrahasa-store` service.
2. Confirm the persistent volume is attached at `/data` before accepting orders.
3. Confirm `DATA_PATH=/data/chandrahasa.db`, `NODE_ENV=production`, and a unique `SECRET` are set in Railway.
4. Deploy and wait for `/api/health` to return HTTP 200.
5. Verify `/api/categories`, `/api/products?limit=1`, storefront routes, login, admin authorization, cart, COD checkout, duplicate checkout retry, stock concurrency, order confirmation and backup/restore.
6. Configure Razorpay and Shiprocket only with the merchant's real credentials; run their sandbox tests before enabling live payment or shipping workflows.
7. Create the first admin account using `backend/scripts/create-admin.js` from a secure shell. Never place the admin password in source control or this document.
8. Set up encrypted off-platform backups and complete a restore test. A Railway volume is persistent storage, not a backup.

## Release boundary

This is a deployment-configured release candidate, not a production certification. The app must not accept public paid orders until the live runtime and provider acceptance tests pass. The current SQLite runtime is intentionally single-instance. Do not scale it horizontally or deploy multiple writers against the same database file. Admin MFA, distributed rate limiting, independent penetration testing, load testing, legal/tax review, provider settlement verification, monitoring and restore-drill evidence remain separate launch gates.
