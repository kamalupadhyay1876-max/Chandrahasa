# Chandrahasa — Advanced Commerce Delivery

## Delivered in this source package

- Existing storefront, account, cart, wishlist, checkout, admin, payment webhook and Shiprocket shipment workflows retained.
- Saved-address selector in checkout; default address can be selected from the address book; optional save-at-checkout.
- Gift-card redemption during checkout with server-side balance recheck and transactional debit/ledger.
- Loyalty redemption at ₹1/point with 20% cap, transactional balance recheck and ledger; return receipt restores redeemed points and gift-card value, and claws back earned delivery points once.
- Optional OpenAI-compatible semantic search and vector recommendations with batched catalogue embedding generation.
- Optional multimodal visual search with compressed image input and configurable vision model; explicit local colour fallback if AI provider is not configured.
- Seller application approval, KYC metadata/reference review, bank verification gate, seller-owned catalogue listing creation, inventory/price revision review, seller-specific order-line allocation, commission snapshot, seller ledger, payout request and admin settlement status.
- Seller dispute submission and admin review workflow.
- Persisted customer/agent concierge messaging with admin reply inbox.
- Return reverse pickup through Shiprocket return-order API (requires account validation), Razorpay refund after return receipt, and return wallet adjustments.
- Admin Marketplace Operations console linked from admin navigation.

## Verified here

- `node --check` backend and changed frontend JavaScript: passed.
- `node backend/scripts/audit.js`: **69 passed, 0 failed**.
- `python3 QA-SOURCE-CHECKS.py`: **11/11 passed**.
- All seven `db.exec` schema SQL blocks executed against Python SQLite; integrity check returned `ok`; advanced tables created.
- Admin marketplace inline JavaScript syntax checked separately.

## Not verified / still required before production

1. The native `better-sqlite3` package installation did not complete in this workspace; actual Node database boot/migration and database-backed API tests could not run.
2. `playwright-core` was unavailable; full browser checkout E2E did not run.
3. No Razorpay test/live credentials were available. Payment capture, webhook signatures, refunds, partial refunds and reconciliation need sandbox testing.
4. No Shiprocket account credentials were available. Outbound and reverse pickup flows need account-level sandbox verification; return API payload, pickup address, courier availability, AWB and webhook/tracking reconciliation must be tested.
5. OpenAI vision/embedding provider was not configured; no external AI calls or semantic quality evaluation were performed.
6. Seller KYC and bank verification are manual admin workflows, not a KYC vendor integration. Automated bank payouts, GST/TCS, invoices, seller tax compliance and financial reconciliation are not implemented.
7. Seller order-line allocation is implemented, but separate child orders, independent seller shipping labels, multiple seller offers for the same SKU, seller warehouse/location management, marketplace SLA/fraud/chargeback controls and a complete dispute evidence workflow remain incomplete.
8. COD and gift-card/loyalty refund settlement to bank/wallet requires business policy and bank validation; only captured Razorpay refunds and gift-card/points restoration after received return are supported.
9. Concierge chat is persisted async messaging, not real-time WebSocket/push or staffed live support. Email/SMS/WhatsApp notifications are not wired.
10. No live deployment was performed. Railway Variables, persistent volume, production backup/restore drill, HTTPS/domain, monitoring, rate/load testing and launch approval remain operator tasks.

**Release status: advanced implementation candidate; not Amazon-equivalent and not production-certified.** Do not enable live payments or third-party seller sales until the above release gates are closed.
