# Chandrahasa — customer experience & commerce upgrade

## Added in this package
- Dedicated `/cart` page with quantity changes/removal and checkout CTA. Existing product-page Add to Bag and Buy Now flows are preserved.
- Dedicated `/wishlist` page with saved product cards, product links and removal.
- `/addresses`: authenticated saved-address CRUD (add/list/delete), default-address selection.
- `/track-order`: authenticated order lookup by order number; displays fulfillment/payment status and AWB when present.
- `/returns`: authenticated return request submission for delivered orders, duplicate-open-request prevention, status history; admin list/status API.
- `/help`: FAQ page.
- `/support`: customer support ticket creation and ticket history; this is async ticketing, not live chat.
- `/compare`: compare up to four product IDs; product page has Add to compare.
- Product Q&A submission and published answers; admin list/answer APIs.
- `/search`: server-side product search and URL-based results.
- `/gift-cards`: balance lookup; admin can issue gift-card codes. Gift-card redemption at checkout is not enabled yet.
- `/rewards`: loyalty ledger display. Admin delivery-status transition awards 1 point per ₹100 once per order.
- `/seller-portal`: seller application intake and admin approval/status API.
- Recommendation API ranks same-category products using rating/review count; product page already shows related products.

## Important implementation boundaries
- Voice search is not yet wired into the storefront; browser speech recognition varies by device/browser and needs a supported-browser UX and tests.
- Visual/image search is not implemented; no image embedding/index service is configured.
- Gift-card redemption, partial balance handling, expiry/refund accounting and gift-card checkout reconciliation are not implemented.
- Loyalty redemption, expiry, fraud controls, returns clawback and customer reward terms are not implemented. Points are an initial earn ledger only.
- Seller application/approval data model exists, but multi-vendor catalogue ownership, split carts/orders, commissions settlement, KYC/tax, seller payouts, seller shipping and dispute workflows are not implemented. Seller checkout is not enabled.
- Support tickets are not real-time chat and have no email/SMS notification provider wired.
- Returns are requests only. Actual reverse pickup, inspection workflow, automatic Razorpay refund execution and refund webhooks remain provider/admin operations and require sandbox credentials/tests.
- Tracking reads the stored shipment/AWB fields. Live Shiprocket sync requires configured credentials and sandbox verification.
- Address book is available as a customer page/API; checkout auto-population from a selected saved address still needs UI integration.
- Compare page accepts up to four product IDs; product page adds the current item. Search ranking is basic SQL LIKE, not typo-tolerant AI search.

## Validation
- JavaScript syntax checks passed.
- Existing source audit: 55 passed, 0 failed.
- Existing QA source checks: 11 passed, 0 failed.
- Database runtime migrations and API integration tests were not run in this environment because backend dependencies (`better-sqlite3`) are not installed here. Run `npm ci` in `backend/`, then `npm test` and end-to-end sandbox tests before enabling live orders.
- No Razorpay or Shiprocket sandbox transaction was executed. No live deployment was performed.
