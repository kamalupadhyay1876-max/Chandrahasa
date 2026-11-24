# Chandrahasa final merge / integration work

This release is based on the original full-size Chandrahasa site, not the reduced scaffold. The original pages, styles, image/font assets, storefront, customer/account flows, admin pages, SQLite server and prior upgrades are retained.

## Changes in this merge
- Payment recovery controls in the Operations Control Room: admin can reconcile a Razorpay order and request a full refund with confirmation. These use existing server routes.
- Webhook event persistence is now fail-closed and idempotent: duplicate event IDs return without processing again.
- Late captured payments following stock-release are handled by an atomic attempt to re-reserve stock; if reservation is no longer possible, the order is marked paid and pending manual inventory resolution rather than falsely confirmed for fulfilment.
- Refund processed webhook updates payment/order status.

## Configure (sandbox first)
Use a unique production SECRET (32+ characters), Razorpay test credentials and webhook secret, and Shiprocket credentials/pickup location. Configure webhook endpoint `/api/payments/webhook` and the gateway events `payment.captured`, `payment.failed`, and `refund.processed`. The webhook URL must be publicly reachable over HTTPS in deployment.

## Test status
Static source audit and syntax checks pass. A browser E2E run and live Razorpay/Shiprocket sandbox run have not been verified in this environment because dependency installation timed out. The code does not include independent penetration-test results or a guarantee of launch readiness.

## Required before live-money launch
1. Run browser E2E against a clean seeded test DB and actual Chromium installation.
2. Exercise payment capture/failure/duplicate webhook/late capture/stock-shortage/refund/reconciliation cases in Razorpay test mode.
3. Exercise Shiprocket test shipments with real product weights/dimensions and validate pickup location, address format, tax/invoice, COD and serviceability.
4. Review rate limiting, MFA, operational logging, database backup and restore, TLS, payment disputes/refund policies, privacy/GST/legal terms.
5. Run independent penetration test and owner acceptance testing. This release is not certified.
