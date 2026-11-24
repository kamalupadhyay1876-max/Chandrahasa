# Security review notes — 2026 upgrade

This is an internal code-level review checklist, not an independent penetration test or certification.

## Implemented in this upgrade
- Razorpay webhook signature validation against raw request body and webhook secret.
- Captured payment webhook confirms matching gateway order, amount (paise), and currency.
- Failed-payment webhook marks eligible unpaid orders failed/cancelled and restores stock with an idempotent release marker.
- Admin refund request calls Razorpay refund API, validates refund amount against recorded paid amount, and records pending status.
- Shiprocket order payload derives weight from product weight text where parseable, with 250g per item fallback.
- Existing admin RBAC gate retained for shipment/refund routes.
- Idempotent webhook event storage.

## Required external review / unresolved risk
- Confirm payment event ordering and reconcile gateway captures/refunds against DB before dispatch.
- Failed payment webhook may arrive out of order with a later capture; implement a durable reservation state machine and reconciliation before accepting production traffic. The stock-release behavior is not yet proven safe for every gateway race.
- Refund status polling/webhook updates need reconciliation and a refunds table workflow; refund API currently records a pending status in the payments record, not a complete refund ledger.
- Shiprocket SKU, item weights, pickup location, courier selection, label generation, manifest, pickup and shipment-status webhook need live test-account verification.
- Verify rate limiting, CSRF protection, admin MFA, session revocation, dependency vulnerability scanning, backup/restore, privacy/legal compliance, accessibility, and load testing.
- E2E browser tests were not run: npm install timed out in this environment. No third-party penetration test was conducted.

## Launch gate
Run checkout/payment tests using Razorpay test credentials and webhook secret; verify duplicate/out-of-order events, partial/full refunds, stock restoration, COD, Shiprocket test orders, and admin permissions. Do not enable live money movement until reconciled and reviewed.
