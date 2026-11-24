# Chandrahasa deployment settings

## Vercel frontend
- Root Directory: `frontend`
- Framework Preset: Other (static HTML + Vercel Node Function)
- Build Command: leave empty
- Output Directory: `.`
- Environment Variable (Production + Preview as appropriate): `CHANDRAHASA_API_URL=https://YOUR-ACTUAL-BACKEND-HOST` (origin only; no `/api` suffix)
- Redeploy after setting the environment variable.

The `/api/*` route is proxied by `frontend/api/[...path].js` to the backend. If the variable is absent, the proxy returns HTTP 503 with a configuration message; it does not silently use mock data.

## Backend (Render or equivalent Node host)
- Root Directory: `backend`
- Runtime: Node.js 20 or later
- Build: `npm ci`
- Start: `npm start`
- Configure all required secrets from `backend/.env.example` in the host dashboard. Use strong random secrets; never commit `.env`.
- Set `FRONTEND_URL` / allowed origin to the exact Vercel production domain as required by the backend configuration.
- Configure a persistent disk if retaining the current SQLite database. PostgreSQL is not automatically enabled by this frontend proxy.

## Release gates
A deploy is not production-ready until the real backend URL and provider secrets are configured, database persistence is confirmed, `/api/health` returns healthy through the Vercel domain, and payment/refund/shipping sandbox flows are exercised. No demo products, customer reviews, HUIDs or payment success are fabricated by the frontend.
