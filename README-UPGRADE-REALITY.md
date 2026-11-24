# Chandrahasa Split Package — Upgrade & Verification Reality

This package is a split frontend/backend deployment bundle. It is **not** a completed PostgreSQL conversion or a live production deployment.

## Frontend
- Static HTML/CSS/JS storefront remains in `frontend/`.
- Frontend uses same-origin `/api/...` requests; Vercel rewrite proxies those to the backend host.
- Edit `frontend/vercel.json` and replace `YOUR-RENDER-BACKEND.onrender.com` with the actual backend hostname before deploying.

## Backend
- Existing Node HTTP server and SQLite (`better-sqlite3`) implementation remains in `backend/`.
- Render deployment requires persistent disk mounted at `/var/data`, with `DATA_PATH=/var/data/chandrahasa.db`.
- PostgreSQL is not implemented in this bundle. Multi-instance scaling is not safe with this SQLite setup.
- Payment, refund, Shiprocket and notification integration paths require provider credentials and sandbox/live verification. Presence of code does not constitute verification.

## Tests to run
From `backend/`: `npm ci`, `npm run syntax`, `npm test`, and `npm run e2e`. E2E and provider flows require the appropriate test setup. Do not accept live payments until webhook/refund/reconciliation and concurrency flows are verified.
