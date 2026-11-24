# Chandrahasa — Advanced Commerce Upgrade (24 Nov 2026)

This upgrade extends the existing single-service Node + SQLite storefront. It does **not** claim Amazon parity, production certification, or live provider verification.

## Implemented in this package

### Checkout and customer wallet
- Checkout can load a signed-in customer's saved addresses, select the default/other saved address, and save a new checkout address.
- Gift card redemption is server-calculated, balance-debited inside the order transaction, and written to a redemption ledger. Gift card balance lookup remains available.
- Loyalty points can be redeemed at ₹1 per point, capped at 20% of pre-wallet order value; balance is rechecked inside the transaction and a redemption ledger is written.
- Wallet-only (zero-payable) orders are marked paid/confirmed without calling Razorpay.
- Return receipt restores gift-card value and redeemed loyalty points once, and claws back earned delivery points once.

### Marketplace operations foundation
- Seller application approval remains admin-controlled.
- Approved sellers can submit legal/KYC metadata using a document reference; full PAN/bank details are intentionally not collected by this app. Admin can review/verify KYC and bank status.
- Verified sellers can create catalogue listings, price/stock updates, and seller SKU data. Listings remain hidden until admin approval.
- Checkout allocates eligible product lines to approved, KYC-verified seller listings, snapshots commission and seller net amount, and creates seller order lines/ledger entries.
- Seller dashboard exposes orders, listing states, cleared balance, payout requests and dispute submission.
- Admin marketplace console handles applications, KYC/bank verification, listing approval, payouts, disputes, customer concierge replies, returns reverse pickup and refund actions.
- Seller payouts require verified KYC + bank status and minimum ₹500. Marking paid requires a bank transfer reference.

### Discovery and support
- Optional OpenAI-compatible text embeddings power semantic recommendations/search when `OPENAI_API_KEY` is configured and catalogue embeddings are built.
- Admin embedding rebuild is batched (20 products per request) to avoid a single long request.
- Visual search can call a configured vision model (`VISION_MODEL`, default `gpt-4o-mini`) with a compressed image and catalogue retrieval terms. Without a provider key it falls back to browser-local colour descriptors and is clearly labelled as fallback.
- Customer concierge chat persists messages; admin can reply from the Marketplace Operations page. It is an asynchronous inbox, not guaranteed instant live chat.

### Returns and fulfilment
- Admin can create Shiprocket reverse-pickup orders for approved returns, with an idempotent reservation and unknown-outcome guard.
- Admin can issue Razorpay refunds only after the returned parcel is marked received and the order has a captured online payment. Refund webhook reconciliation remains authoritative.
- COD refunds are not automated: verified bank account details and a compliant payout workflow are required.

## Required environment variables

```env
OPENAI_API_KEY=
EMBEDDINGS_API_URL=https://api.openai.com/v1/embeddings
EMBEDDINGS_MODEL=text-embedding-3-small
VISION_MODEL=gpt-4o-mini
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=
SHIPROCKET_PICKUP_LOCATION=Primary
```

Keep all secrets in Railway Variables or the deployment secret manager. Never commit `.env` or paste credentials into chat. AI requests send product catalogue text or the compressed visual-search image to the configured provider; configure data handling and privacy notices before production use.

## Explicit limitations / launch gates

- The seller model supports seller-owned products and per-line allocation across sellers, but is not yet a fully isolated marketplace: no separate seller-owned warehouse locations, multi-seller offer buy-box for the same SKU, independent seller shipment labels/returns, tax invoices, GST/TCS compliance, settlement reconciliation, automated bank payouts, fraud scoring, seller SLA enforcement, or full dispute evidence workflow.
- KYC is a manual metadata/reference workflow, not an integrated KYC vendor or document verification service. Bank verification is admin/manual.
- Seller line commission snapshots are recorded; configurable category-level fees, GST on commission, reserve/chargeback policy, and payout reconciliation are not production-complete.
- Gift card checkout and loyalty redemption are implemented; refunds restore gift card and loyalty wallet values when return status is moved to received. Mixed payment refund allocation and provider-specific wallet refund policies still need accountant/legal review.
- Reverse pickup endpoint must be validated against the merchant's Shiprocket account, pickup address, courier availability and live return-order API response. It has not been sandbox-tested here.
- Razorpay refund endpoint exists and is invoked for eligible received returns; real refunds, partial refund policy, COD refund and webhook reconciliation must be sandbox-tested with merchant credentials.
- AI semantic/vision features are dormant until provider credentials are configured and embeddings built. No AI provider calls were made in this development environment.
- Chat is persisted async messaging, not WebSocket/push/live agent presence. Email/SMS/WhatsApp notifications are not integrated.
- Payment/shipping sandbox verification, production data migration backup, restore drill, security review, load testing and browser checkout E2E remain release blockers.

## Verification performed in this workspace

- `node --check` on backend and changed frontend JavaScript: passed.
- `node backend/scripts/audit.js`: 63 passed, 0 failed (source-level checks).
- `python3 QA-SOURCE-CHECKS.py`: 11/11 passed (source-level checks).
- SQLite schema SQL blocks executed in Python's SQLite engine; integrity check `ok`, including new marketplace, wallet, return, chat and embedding tables.
- `node scripts/e2e.js` could not run because `playwright-core` was not installed in this environment.
- Native `better-sqlite3` runtime integration could not be exercised because dependency installation timed out/incomplete. Do not treat schema parsing as a substitute for application runtime migration testing.
- No external provider sandbox or live browser test was run.
