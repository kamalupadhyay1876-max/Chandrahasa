# Chandrahasa — Production Completion Engineering Pass (24 Nov 2026)

This report supersedes older source-level completion summaries for the changes listed here. It records code changes and offline checks only; it is not a production certification or a live-provider verification.

## Implemented in this pass

### Retryable Razorpay webhook inbox
- `webhook_events` now tracks `pending`, `processing`, `processed`, and `failed`, plus attempt count, processing lease, completion timestamp and last error.
- A webhook is acknowledged as duplicate only after it is marked processed.
- Failed handlers can be retried by the provider; stale processing leases can be reclaimed after two minutes.
- Signature verification remains HMAC-SHA256 with timing-safe comparison.
- Amount/currency mismatch is recorded as a security event.
- Late captured payments on cancelled orders no longer resurrect the order or re-reserve released stock; they remain cancelled and trigger a refund-review event.
- Browser payment verification and admin payment reconciliation also preserve cancelled status and flag the captured payment for review.

### Durable notification event delivery
- Added a durable outbox worker with a five-minute processing lease, HMAC-SHA256 request signature, HTTPS-only endpoint validation, timeout, exponential retry, and dead-letter state after eight attempts.
- Events currently queued include payment capture, late capture after cancellation, refund result, COD confirmation, return request/status and seller transfer outcomes.
- Added admin outbox status and retry APIs plus an Operations Control Room panel.
- This is a generic private automation webhook (e.g. n8n), **not** a built-in email/SMS/WhatsApp provider. Delivery remains inactive until the owner configures the endpoint and a 32+ character secret.

### Order and return lifecycle hardening
- Added explicit order transition rules; invalid jumps are rejected.
- Online orders must have captured payment before shipment/delivery.
- Captured online orders cannot be cancelled through the fulfilment endpoint until refund handling is complete; use return/refund flow.
- Fulfilment metadata endpoint can no longer bypass order lifecycle side effects; Operations UI calls the dedicated lifecycle route.
- COD confirmation now requires the order owner/admin and an actual COD order; cancelled orders cannot be reconfirmed.
- Cancellation restores catalogue stock once using `stock_releases` and releases seller warehouse reservations inside the same database transaction. Delivery consumes seller warehouse reservations and clears seller ledger rows atomically; reservation mismatches roll back the transition.
- Return status now follows a state machine and requires an approved return before the order can become returned; gift-card/loyalty restoration runs when parcel is received, not when an arbitrary refunded status is selected.
- Online return cannot be marked refunded until the full captured gateway amount is reconciled as processed. Delivered COD collection can now be recorded by an admin with collection method/reference; COD seller balances can use manual seller payouts even when the seller also has a Razorpay Route account. Delivered COD collection is now recorded by an admin with collection method/reference; Razorpay Route is restricted to captured Razorpay prepaid orders, while collected COD balances can use manual seller payout requests even when a seller also has a Route account. COD refund requires a manual bank transfer reference, and COD orders are blocked from Razorpay refund endpoints.
- Operations UI now exposes return receipt, COD bank-refund recording, online refund and reconciliation actions.

### Runtime and packaging
- Raised Node engine requirement to `>=20`, matching `better-sqlite3` and `playwright-core` lockfile engine requirements.
- Moved `playwright-core` to devDependencies so it is not included in production `npm ci --omit=dev` images.
- Kept the one-service Railway Docker deployment and persistent SQLite volume model.
- Added an offline SQLite schema/additive-migration smoke test.

## Verification performed

- `node backend/scripts/audit.js`: 91 passed, 0 failed (source-level assertions).
- `python3 QA-SOURCE-CHECKS.py`: 45 passed, 0 failed.
- `python3 backend/tests/schema-check.py`: static SQLite schema blocks, webhook/outbox columns, legacy additive migration simulation and SQLite integrity check passed.
- JavaScript syntax checks: run by QA script across all frontend/backend JS files.
- `npm ci --dry-run --ignore-scripts --no-audit --no-fund`: passed lockfile consistency.
- ZIP integrity: to be recorded in final delivery artifact.

## Still not verified / launch gates

- Native `better-sqlite3` install/runtime and actual server boot could not be completed in this environment; `npm ci` timed out. The dry-run is not a runtime install.
- Playwright browser E2E was not run; no Chromium browser was provisioned.
- Razorpay sandbox/live webhook, refunds, reconciliation and seller Route transfers were not exercised with merchant credentials.
- Shiprocket seller-account shipment, AWB, label, tracking and reverse-pickup were not exercised with seller credentials. No verified official Shiprocket webhook signature contract has been implemented; tracking remains API polling.
- Notification delivery requires an owner-configured HTTPS endpoint and was not sent to a real provider.
- Other carriers, built-in email/SMS/WhatsApp provider adapters, automated COD bank transfers (the app records manual transfer references only), automated bank payouts outside the manual recorded process/Razorpay Route, and GST/TCS legal/accountant sign-off remain external/provider or business-compliance work.
- SQLite requires a persistent `/data` volume and one Railway replica. Do not scale this single-writer SQLite deployment horizontally.
- Before launch: configure strong secrets, take a backup, run install/start/health checks on Railway, complete Razorpay and Shiprocket sandbox tests, browser checkout/returns tests, restore drill, and load/security review.

## Why the source ZIP is about 1.5 MB

The package contains source code, 20+ storefront pages/modules, backend, documentation, scripts, fonts and product/hero images. `node_modules`, `.git`, `.env`, database files, backups and generated browser screenshots are excluded intentionally. The archive contains about 200 source files and roughly 2 MB uncompressed; ZIP compression brings it to around 1.5 MB. ZIP size is not a measure of feature completeness.
