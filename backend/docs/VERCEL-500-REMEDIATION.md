# Vercel 500 — FUNCTION_INVOCATION_FAILED

## Diagnosis boundary

The request ID `bom1::5d4l8-1795437998355-61beda362a47` is not enough to identify the underlying exception without the Vercel function log. This project currently runs a Node HTTP server and initializes `better-sqlite3` at process startup. It is not a Vercel-native serverless adapter and its SQLite database relies on writable/persistent filesystem storage. A Vercel function filesystem is not suitable as a persistent SQLite store. The error may be an entrypoint/build/native-module/runtime issue; do not assume the exact cause without logs.

## Recommended immediate fix (keep this app's current runtime)

1. Deploy this project to Render (or a Docker host) with persistent disk attached, not Vercel.
2. Build: `npm ci`
3. Start: `npm start`
4. Set `NODE_ENV=production`, a random `SECRET` of at least 32 characters, and `DATA_PATH=/var/data/chandrahasa.db`.
5. Attach persistent disk at `/var/data` and configure health check `/api/health`.
6. Add payment, email and Shiprocket credentials later as environment variables. Online payment is deliberately unavailable without the Razorpay key pair.
7. Check `/api/health`, then logs, and run the test checkout before launch.

## If Vercel is required

First migrate the runtime away from synchronous SQLite and the self-starting `server.listen()` entrypoint to a supported serverless handler and durable PostgreSQL. That work is not represented as complete in this handover. Avoid deploying this SQLite runtime to Vercel and exposing an ephemeral database to customer orders.

## Logs

Use the Vercel dashboard's Functions log view for the deployment, filter around the timestamp, and inspect the function's first exception. Do not paste secrets or customer data into logs or chat.
