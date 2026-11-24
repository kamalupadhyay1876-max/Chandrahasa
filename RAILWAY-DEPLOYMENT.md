# Railway deployment handoff

Chandrahasa is packaged as a single Docker service: the Node backend serves the static frontend and API. The app currently uses SQLite (`better-sqlite3`) and is configured to store its database at `/data/chandrahasa.db` on a Railway persistent volume mounted at `/data`.

## Existing Railway resource configuration

- Project: `Chandrahasa`
- Service: `chandrahasa-store`
- Runtime: Dockerfile at repository root
- Persistent volume: `chandrahasa-data`, mount `/data`
- Health check: `/api/health`
- Required replica count: 1

## Required code source

The Railway service must be connected to a GitHub repository containing the complete contents of this project at its root. Railway's GitHub deployment source builds from the repository; a local ZIP is not itself a connected deployment source.

## Required runtime variables

- `NODE_ENV=production`
- `DATA_PATH=/data/chandrahasa.db`
- `SECRET` = unique random value, minimum 32 characters
- `PORT` is supplied by Railway (the app defaults to 3000 for local use)

## Database decision

Keep SQLite for this deployment. There is no working PostgreSQL adapter in this codebase. A PostgreSQL cutover is a separate engineering project because the current server uses synchronous `better-sqlite3` statements and synchronous transactions throughout. Do not set a PostgreSQL URL and assume migration is complete.

## Go-live checklist

- [ ] Connect the actual project source repository to the Railway service.
- [ ] Confirm Railway volume is attached at `/data` and only one replica is configured.
- [ ] Build and boot the container; health check returns 200.
- [ ] Confirm the database persists across redeploy/restart.
- [ ] Run API and browser end-to-end tests against the deployed runtime.
- [ ] Configure real merchant details, product catalogue, stock and policies.
- [ ] Configure Razorpay test keys; verify payment, webhook replay/order, refunds and reconciliation.
- [ ] Configure Shiprocket sandbox; verify shipment creation idempotency and tracking.
- [ ] Create admin securely; verify authorization and account recovery.
- [ ] Configure backups, monitoring, restore drill and domain/SSL.
- [ ] Obtain merchant approval before switching any provider to live mode.

Do not claim production readiness until every applicable go-live item has evidence.


## Marketplace add-on variables and provider setup

- `SELLER_KYC_WEBHOOK_SECRET`: shared HMAC secret for the provider webhook. Configure provider callback at `/api/marketplace/kyc/webhook`; use `X-Chandrahasa-KYC-Signature` with HMAC-SHA256 of the exact raw JSON body.
- `SELLER_CARRIER_ENCRYPTION_KEY`: dedicated random 32+ character secret used to derive AES-256-GCM keys for each seller Shiprocket credential record. Keep this value stable and backed up securely; rotating it without re-encryption breaks existing seller carrier connections.
- Razorpay Route is a separately approved product. Set up linked accounts and webhook events (`transfer.processed`, `transfer.reversed`, `transfer.failed`) with the Razorpay dashboard; do not treat a normal payment gateway key as Route approval.
- The admin marketplace page provides sub-order release and GST/TCS reconciliation. Keep tax collection disabled until CA confirms operator registration, applicable rates and filing treatment.
- Each approved seller connects their own Shiprocket account in Seller Portal; set up the exact pickup location in that Shiprocket account and add a matching seller warehouse with PIN code in Chandrahasa. Seller-specific shipment booking, serviceability, AWB, labels and tracking use that seller account.
- Admin → Marketplace Operations configures seller SLA/policy enforcement. Start disabled or warning-only; review sample size and seller-attributed quality events before enabling payout holds, listing pauses or suspension.
- WebSocket concierge and the hourly seller policy scheduler use the same Railway service. Keep same-origin deployment and one replica for this SQLite-backed service.


### Optional notification event delivery

Set `NOTIFICATION_WEBHOOK_URL` to a private HTTPS automation endpoint (for example, an n8n webhook) and `NOTIFICATION_WEBHOOK_SECRET` to a stable random secret of at least 32 characters. The outbox signs each JSON body with HMAC-SHA256 in `X-Chandrahasa-Signature`, retries failures with backoff and dead-letters after eight attempts. Without these variables, events remain queued and no email/SMS/WhatsApp is sent.
