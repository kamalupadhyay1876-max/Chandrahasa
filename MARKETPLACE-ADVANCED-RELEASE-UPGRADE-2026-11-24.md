# Chandrahasa — Marketplace release upgrade (2026-11-24)

## Implemented in this source package

1. **Seller KYC provider callback adapter**
   - `POST /api/marketplace/kyc/webhook`
   - HMAC-SHA256 verification of exact raw request body using `SELLER_KYC_WEBHOOK_SECRET` and `X-Chandrahasa-KYC-Signature`.
   - Provider event deduplication; seller KYC/bank status and verified Razorpay Route linked-account ID are persisted.
   - Payout hold is cleared only when KYC and bank both report verified and a linked account ID is present.
   - Provider-hosted onboarding, document collection, PAN/GST verification and bank penny-drop still require an actual provider contract/account and its webhook configuration.

2. **Razorpay Route payout release adapter**
   - Admin sub-order list shows per-seller sub-orders. Optional `AUTO_ROUTE_PAYOUTS=true` starts the Route transfer automatically after the configured seller payout hold. `AUTO_ROUTE_PAYOUT_DELAY_HOURS` defaults to 168 hours (7 days) and is configurable from 0–720 hours; a five-minute scheduler scans eligible transfers. Both flags are off by default and should remain off until sandbox and finance sign-off.
   - `POST /api/admin/marketplace/suborders/release` sends the seller's net share to the verified linked account from the captured customer payment.
   - Explicit `RAZORPAY_ROUTE_ENABLED=true` gate; default is false.
   - Requires captured payment, delivered order, verified KYC/bank, provider linked account and no outstanding customer refund activity.
   - Atomic `transfer_initiating` reservation prevents two simultaneous release clicks. Unknown results become `transfer_unknown`; reconcile in Razorpay before any manual recovery.
   - Transfer webhooks update processed/reversed/failed status. Refund webhooks update the local refund ledger, and Admin can query Razorpay directly through **Verify refund with Razorpay** to reconcile exact provider refund ID, payment ID, amount and status. Customer refund is blocked while a seller transfer exists until Route reversal/reconciliation is completed.
   - Razorpay Route must be separately approved and activated; a standard Payment Gateway key does not grant Route access.

3. **Independent seller sub-orders**
   - One parent customer order is grouped into unique `(order_id, seller_id)` sub-orders.
   - Each sub-order records seller, dispatch warehouse, gross, commission, seller share, TCS and transfer reference.
   - Seller order lines and ledger remain the source of per-item commission and payable amounts.

4. **Seller warehouse and inventory controls**
   - Seller can create warehouse records and set a default dispatch warehouse.
   - Product-wise on-hand quantity and reserved quantity are maintained with inventory movement history.
   - Checkout reserves stock; cancellation releases a reservation; delivery consumes reserved stock. Returns do not automatically restock until physical inspection.
   - Only the seller's default warehouse is automatically selected at checkout; multi-warehouse allocation/route optimization is not included.

5. **GST/TCS working ledger**
   - Admin can set marketplace GSTIN and CA-confirmed intra/inter-state TCS rates. Ledger is disabled by default.
   - When enabled, seller marketplace checkout requires a valid seller GSTIN; payment capture records seller-wise tax ledger entries.
   - Full-return receipt/refund creates negative TCS/taxable-value adjustments.
   - Admin can export monthly CSV reconciliation.
   - This is not a GST invoice engine, GSTR-8 filing integration, GST portal API, legal determination of TCS applicability/rates, or CA sign-off. Discounts, cess, complex place-of-supply, amendments and partial-item returns need tax-professional validation before use.

6. **True WebSocket concierge chat**
   - Native RFC6455 WebSocket endpoint at same-origin `/ws/chat`, authenticated with the existing session cookie and checked Origin.
   - Customer/admin messages persist to SQLite and broadcast live to the matching thread; REST inbox remains fallback.
   - One Railway service/replica is supported. Multiple replicas require shared pub/sub (e.g. Redis) and a different session/DB architecture.

## Owner/provider activation steps

- Create/activate a KYC vendor and have it host seller onboarding/document collection. Configure its signed callback to `/api/marketplace/kyc/webhook` and set `SELLER_KYC_WEBHOOK_SECRET` in Railway. The callback contract is documented in `OWNER-SETUP-HINGLISH.md`.
- Apply to Razorpay for Route/Linked Accounts separately. Configure transfer webhook events at the existing payment webhook URL. Only after approval, set `RAZORPAY_ROUTE_ENABLED=true`.
- Ask a CA to confirm operator GST registration, supplier eligibility, TCS applicability/rates, invoice responsibility and return treatment before enabling tax ledger.
- Configure actual seller agreements, KYC, return/chargeback policy and warehouse stock before listing third-party products publicly.

## Verification status

- Source audit: 76/76 checks passed.
- Source QA: 21/21 checks passed.
- All backend/frontend JavaScript syntax checks passed; admin marketplace inline script checked separately.
- SQLite schema blocks and seller profile forward migrations executed against Python SQLite; both monthly tax-report UNION queries executed successfully.
- ZIP integrity check is run at packaging.
- **Not run:** Node runtime integration against `better-sqlite3`, authenticated WebSocket browser E2E, Razorpay test Route transfer, KYC vendor callback from a real provider, Shiprocket live events, GST portal filing, or live Railway deployment. These require dependencies, owner credentials and provider account approvals.
