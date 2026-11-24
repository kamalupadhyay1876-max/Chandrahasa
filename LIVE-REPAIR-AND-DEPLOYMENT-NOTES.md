# Chandrahasa live repair notes

## What was repaired in this source package

- Global search now has a labelled form, keyboard submission, a close control, live suggestions, a full-results handoff to `/shop?search=...`, stale-response protection, and visible empty/error/loading states.
- The shop page now reads `search` from the URL and sends it to the live products API.
- Product search on the backend now also matches category names.
- In-stock and sale filters are sent to the backend, so the API's result count and pagination reflect those filters rather than filtering only the current browser page.
- Home and shop catalogue failures are visible and provide a recovery path instead of silently leaving a spinner or blank results.
- `/operations` redirects to the existing `/admin-operations` page.
- Search modal is restyled as a premium ivory panel with burgundy/gold accents and mobile-friendly controls.

## Why the currently deployed site cannot load products yet

The Vercel function `frontend/api/[...path].js` requires the Vercel project environment variable `CHANDRAHASA_API_URL`. It must contain the real backend origin only, for example `https://service-name.onrender.com` (do not append `/api`). Without it the function deliberately returns HTTP 503. This is not fixable from frontend code alone and must not be replaced with demo products.

## Deployment configuration

1. Import/deploy the `frontend/` directory as the Vercel project root.
2. Framework preset: Other; build command empty; output directory `.`.
3. Add `CHANDRAHASA_API_URL` in Vercel Production, Preview and Development environments as appropriate, using the actual deployed backend origin.
4. Redeploy after setting the environment variable.
5. Deploy the `backend/` directory to a Node.js host with persistent database storage and set its required environment variables from `backend/.env.example`.
6. Check `https://<frontend-domain>/api/health`, `/api/categories`, `/api/products?limit=1`, `/shop?search=ring`, `/account`, `/admin`, and `/operations`.

## Not claimed as complete

This package has not been deployed to the user's Vercel/Render accounts. No backend hostname or production secrets were provided. Real payment, shipping, email, database concurrency, security penetration, load, backup-restore and live-device tests have not been run. The 200-feature map is a product/component inventory, not a claim that every item exists or is production-tested.
