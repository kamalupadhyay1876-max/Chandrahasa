# QA plan

## Unit/route checks
Run `npm test` and `npm run audit`. These are lightweight checks and are not a certification or full security audit.

## Manual browser matrix
- Android 360px and 412px viewport; desktop 1280px.
- Keyboard-only, visible focus, screen-reader labels, reduced motion.
- Empty cart, stock boundary, invalid coupon, API unavailable, expired session.
- Checkout address validation and server recalculation of price/discount/shipping.
- Order authorization: user A cannot retrieve/update user B order.
- Payment success, failure, cancel, duplicate webhook and webhook signature invalid.
- COD order: authorization, duplicate submit, rate limiting and inventory consistency.
- Password recovery: expired token, repeated token, generic response and delivery.
- Admin: customer cannot access admin endpoints even when manually calling API.
- Backup restore; DB migration on a copy of production-like data.
