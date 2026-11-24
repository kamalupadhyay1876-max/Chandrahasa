# Remaining production launch gates — 24 Nov 2026

The source package has received additional code hardening. Read `PRODUCTION-COMPLETION-ENGINEERING-PASS-2026-11-24.md` for the exact implemented changes and verification boundaries. Do not describe this source package as live-production certified.

## Required before real customers / live payments

1. Install and boot the project on the actual target runtime (`Node 20+`, `npm ci`, persistent Railway `/data` volume); verify `/api/health` and SQLite migrations against a copy of production data.
2. Configure unique `SECRET`, Razorpay key/secret/webhook secret, Shiprocket credentials, and `SELLER_CARRIER_ENCRYPTION_KEY`. Configure `NOTIFICATION_WEBHOOK_URL` + `NOTIFICATION_WEBHOOK_SECRET` only if a private HTTPS automation endpoint is available.
3. Run Razorpay sandbox tests: payment captured, failed/retry, duplicate webhook, handler retry, amount mismatch, late capture after cancellation, partial/full refund, refund failed/processed and reconciliation.
4. Run Shiprocket tests with real test credentials: seller account login, serviceability, shipment, AWB, label, tracking and reverse pickup. Verify each seller's pickup location and API entitlement.
5. Run browser E2E for guest/customer checkout, account, admin RBAC, seller onboarding/catalogue, multi-seller order, inventory concurrency, cancellation, returns, refund and mobile layouts.
6. Run database backup + restore drill, dependency/security review, rate-limit review and load test on the deployed Railway service.
7. Obtain accountant/legal sign-off for GST/TCS, seller commission, invoices, KYC, COD refund and settlement procedures.

## Architecture constraints

- Runtime database is SQLite (`better-sqlite3`), not PostgreSQL. Railway must mount a persistent volume at `/data` and use one replica. Horizontal multi-replica deployment is not supported by this SQLite scheduler/locking model.
- `playwright-core` is a development dependency and is excluded from production image installs. Browser tests need a compatible Chromium binary and `CHROMIUM_PATH` when not installed at the default location.
- Notification outbox uses a generic HTTPS HMAC webhook; it does not itself send email, SMS or WhatsApp.
- Seller per-account carrier integration is currently Shiprocket only. Other carriers and official Shiprocket webhook authentication remain pending provider-specific implementation/verification.
- COD refunds require manual bank transfer evidence; no bank payout API is configured.

A green source audit is necessary but is not equivalent to sandbox, browser, live provider, restore, performance or security certification.
