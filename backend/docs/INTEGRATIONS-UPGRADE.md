# Payment & shipping integration upgrade

## Razorpay
- Server creates Razorpay Orders through the Orders API for each checkout, using the server-side key secret.
- Browser Checkout uses the returned gateway order id, amount and public key ID.
- Checkout handler sends Razorpay payment/order/signature values to server-side HMAC signature verification.
- Order is marked paid/confirmed only after signature verification. Payment rows are persisted.
- Credentials: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
- Test keys first. Switch to live keys only after checkout/webhook reconciliation and refund tests.

## Shiprocket
- Admin-only create-shipment and AWB-tracking API routes are provided.
- Create shipment route uses Shiprocket login token and posts order payload, then records shipment ID.
- Credentials: `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`.
- Route paths: `POST /api/admin/shiprocket/create` with `{orderId}`; `GET /api/admin/shiprocket/track?awb=...`.
- Validate pickup location, shipping dimensions/weight, serviceability, labels and courier selection in the Shiprocket account before production. Default weight is a placeholder and must be replaced with actual per-product weights before dispatch.

## Verification limitations
- Static audit is not an external security audit.
- Browser E2E tests require installed dependencies and a supported Chromium executable; these were not run in this environment.
- Payment reconciliation/refunds and signed webhook ingestion are not implemented. Do not launch real-money live payments until webhook reconciliation, refund handling, failed-payment stock release, admin UI workflow and independent security review are completed.
