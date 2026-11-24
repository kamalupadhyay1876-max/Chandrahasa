# Vercel ZIP deployment (static preview only)

This package configures Vercel to serve the storefront files from `public/` and clean page routes. It is a **static preview**, not a working full-stack commerce deployment. API calls (`/api/...`) will fail because the existing server.js + SQLite runtime has not been converted into Vercel Functions and a durable database. Do not accept customer orders or payments from this preview.

## Deploy
1. Extract the ZIP.
2. Upload the folder to a GitHub repository (files, not the ZIP).
3. Import that repository at https://vercel.com/new .
4. Framework preset: Other. Root directory: project root. No build command; output directory configuration is handled by `vercel.json`.
5. Deploy and inspect the preview.

## Full-stack Vercel requirement
A production Vercel port requires replacing SQLite with a durable database (e.g. Postgres), refactoring server.js into supported handlers/functions, migrating upload storage to object storage, and testing auth/checkout/payment webhooks and race-safety. This is not implemented in this ZIP.

Original Node/SQLite project and assets remain included. For a working Node+SQLite backend use the deployment options documented in `deploy/DEPLOY-RENDER.md`.
