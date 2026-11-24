# Railway configuration result — 24 November 2026

The connected Railway account contains a `Chandrahasa` project with a `chandrahasa-store` service and a 500 MB persistent volume named `chandrahasa-data` mounted at `/data` in the production environment.

The service environment was configured with:

- `NODE_ENV=production`
- `DATA_PATH=/data/chandrahasa.db`
- `SECRET` = a unique 64-character random secret

The value of `SECRET` is intentionally not recorded in this package.

The source service currently has no successful deployment/source attached (`latestDeployment` was null when inspected). Therefore no live website or health-check pass is claimed. The next deployment prerequisite is connecting the full project source repository to the existing Railway service. The app's existing repository `kamalupadhyay1876-max/Chandrahasa` was found empty at inspection time; it is not yet a deployable source.

The app remains SQLite-backed. The existing Dockerfile combines the static frontend and backend into one service and uses the Railway volume. Keep one replica. A PostgreSQL adapter is not present and is not claimed by this configuration.

Source checks run after the Railway configuration docs were updated:

- `node --check backend/server.js`: passed
- `node --check backend/db.js`: passed
- `python3 QA-SOURCE-CHECKS.py`: 11/11 passed
- `node backend/scripts/audit.js`: 51/51 passed
- `npm ci --omit=dev --no-audit --no-fund`: timed out in this environment; the native `better-sqlite3` module was therefore unavailable for a runtime DB boot test.

Not run / not verified:

- Docker image build and live Railway deploy
- live `/api/health` request
- SQLite runtime boot and persistence across redeploy
- browser/API end-to-end tests against Railway
- Razorpay and Shiprocket sandbox/live flows
- backup/restore drill, load test, independent penetration test
