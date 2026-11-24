# Client launch gate

## Verified in package
- Original storefront, pages, product assets, fonts, Three.js and client modules retained.
- REST server, SQLite persistence and schema, sessions, hashed passwords, admin role checks, customer order access controls.
- Cross-origin mutation Origin guard where Origin is supplied, body size cap, static path protection, auth rate limiting, CSP/security headers.
- Payment verification endpoint fails closed rather than accepting simulated online payment.
- Source audit script is executable and currently passes its listed checks.

## Required external sign-off / unfinished work
- Live payment: implement Razorpay server-side order creation, signature verification, webhook signature verification, idempotency, reconciliation and refund flow.
- Shipping carrier API, live email deliverability, GST/HSN invoice/tax review and legally approved policies.
- Admin MFA, persistent/distributed rate limiting, security logging/alerting, automated backup and restore drill.
- Independent penetration test, accessibility review, mobile/browser matrix, load test and client UAT.
- Production hosting with persistent disk/database, TLS, domain, monitoring, recovery and privacy review.

Do not represent these items as completed merely because credentials or environment variables are present.
