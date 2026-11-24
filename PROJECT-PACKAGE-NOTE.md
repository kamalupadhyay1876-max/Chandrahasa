# Full project source package

This archive contains the current Chandrahasa Railway single-service source project:
- complete frontend source pages, CSS, browser JavaScript, fonts and image assets
- backend Node.js API, database layer, seed script, admin utilities and tests
- package manifests and lockfile for reproducible dependency installation
- Dockerfile, Railway configuration, environment-variable example and deployment guides

`node_modules` is intentionally excluded. It is a machine-generated dependency cache, not project source; install the exact locked dependencies with `npm ci` from `backend/`.

## Local run
1. Install Node.js 20 or newer.
2. Open a terminal in `backend/`.
3. Copy `.env.example` to `.env` and set a unique `SECRET`.
4. Run `npm ci`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

For Railway deployment, follow `RAILWAY-DEPLOYMENT.md`. Mount a persistent volume at `/data` and set the required environment variables. Payment, email and shipping credentials are intentionally not included. Do not accept live payments until the provider webhook and refund flows have been sandbox-tested.

## Important implementation boundary
The current backend uses SQLite (`better-sqlite3`), not PostgreSQL. PostgreSQL migration files are included as migration work, but the running server is not converted to PostgreSQL. This source package is not a claim of live production certification or a completed live deployment.
