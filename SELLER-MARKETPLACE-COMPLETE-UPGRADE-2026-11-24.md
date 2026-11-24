# Chandrahasa Seller Marketplace Upgrade — 24 Nov 2026

## Delivered in source

### Bulk catalogue import
- Seller-only `POST /api/seller/catalog/bulk` accepts JSON row arrays and `text/csv` bodies.
- CSV template: `GET /api/seller/catalog/template.csv`.
- 1–500 rows per batch; per-row validation; seller SKU upsert; per-row result report; batch history at `GET /api/seller/catalog/bulk-jobs`.
- New/changed listings are deliberately deactivated and set to `pending` for admin approval. Bulk import never publishes directly.

### Per-seller shipping
- Seller connects their own Shiprocket account at `POST /api/seller/carriers/shiprocket`; credentials are encrypted with AES-256-GCM using a key derived from `SELLER_CARRIER_ENCRYPTION_KEY` (or the production SECRET fallback).
- `GET /api/seller/carriers` exposes status only; credentials are never returned.
- Seller sub-order shipment creation: `POST /api/seller/suborders/:id/shipment`.
- Courier rates/serviceability: `GET /api/seller/suborders/:id/shipping-options` uses that seller account plus the seller default warehouse PIN, delivery PIN, parcel weight and COD flag.
- AWB assignment: `POST /api/seller/suborders/:id/shipment/awb` with the courier ID returned by serviceability lookup.
- Label generation: `POST /api/seller/suborders/:id/shipment/label`.
- Tracking: `GET /api/seller/suborders/:id/shipment/track`.
- Each shipment is uniquely reserved per seller sub-order. Ambiguous provider outcomes are marked `unknown`; AWB assignment also uses `awb_assigning` / `awb_unknown` and blocks blind retry. Label generation is idempotently reused once a label URL is stored. Seller shipment creation uses that seller's own account and configured pickup location, not the store's central Shiprocket credentials.

### Seller performance
- `GET /api/seller/performance` and admin `GET /api/admin/marketplace/seller-performance`.
- Metrics: late dispatch (using recorded dispatch SLA and AWB assignment time), seller-attributed cancellations and defects, inquiry response rate and average response minutes. Admin records a seller-caused cancellation/defect against the exact seller sub-order with an evidence note; customer-initiated cancellations are not automatically charged to the seller.
- Dispatch SLA is captured when a seller sub-order is created. Existing records receive a 48-hour deadline during migration.
- Response metrics count persisted seller inquiry replies. `POST /api/seller/inquiries` creates an inquiry; authenticated customers can read their inquiries at `GET /api/customer/seller-inquiries`. Seller replies are persisted and visible in that customer endpoint. This is an in-app response record, not proof of email/SMS delivery.

### Policy enforcement
- Admin endpoints: `GET/PUT /api/admin/marketplace/seller-policy`, `POST /api/admin/marketplace/seller-policy/run`.
- Configurable lookback, dispatch SLA, late dispatch ceiling, cancellation ceiling, defect ceiling, response floor, minimum sample size and action.
- Actions: warning, payout hold, pause active listings, or suspend seller and pause listings.
- Optional hourly enforcement; disabled by default. Enforcement events are recorded and admin actions are audited.
- Seller portal displays performance scorecards and policy history. Admin marketplace dashboard configures policy and shows seller scorecards/events.

## Owner setup
1. Set `SELLER_CARRIER_ENCRYPTION_KEY` to a dedicated random secret of at least 32 characters in Railway variables. Do not send it in chat or commit it. Keep it stable: rotating it without re-encrypting stored credentials makes existing seller carrier connections unreadable.
2. Each seller must have an approved seller account and verified KYC before bulk catalogue import.
3. Each seller connects their own Shiprocket credentials and exact pickup location name from their Shiprocket account. Their Shiprocket plan/account must allow API access and pickup location setup.
4. Seller creates a shipment for a seller sub-order, chooses the courier ID from their Shiprocket account, assigns AWB, then generates label and checks tracking. The current UI asks the seller for the courier ID; it does not yet provide a courier recommendation/selection quote grid.
5. Configure seller policy in Admin → Marketplace Operations. Start with warning-only and a minimum sample size of at least 5. Review metrics before enabling punitive actions.
6. Keep automated enforcement disabled until dispatch, cancellations, defect returns and inquiry response records are populated and verified.

## Limitations / external verification required
- Shiprocket seller account activation, API permissions, pickup address, courier availability, AWB allocation and label generation require each seller's own valid Shiprocket account. No live seller account credentials were available in this build session, so no real carrier booking was executed.
- Shiprocket account-level contracts/rates are governed by Shiprocket; the app stores per-seller account credentials and uses the seller's account, but does not negotiate or create a new carrier contract.
- Courier recommendation, rate-shopping, pickup scheduling, NDR automation, shipment cancellation and reverse pickup through each seller's own account remain future extensions. Existing central Shiprocket admin workflow remains unchanged.
- Defect and seller-caused cancellation rates require an admin quality-event record against the exact seller sub-order, with an evidence note. This avoids incorrectly penalising every seller in a multi-seller order for one order-level return reason.
- Response rate measures authenticated in-app inquiry replies, not message delivery/open rates. The inquiry submission API exists; a full customer-facing product Q&A/inquiry form still needs to be added to the product page.
- Policy actions are reversible only by an administrator; no automatic seller reinstatement is performed. Payout hold requires manual review/release. The hourly policy scheduler is in-process and follows the existing single-instance SQLite deployment constraint.
- Source tests do not replace authenticated browser E2E or provider sandbox/live tests.
