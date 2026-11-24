# Chandrahasa — Final owner-ready marketplace upgrade

**This is a source-code delivery, not a verified live production launch.** The project has been edited in place; the existing storefront, checkout, payment, shipping and admin pages are retained.

## Completed in this package

- Seller KYC provider callback adapter: signed HMAC webhook, duplicate event protection, KYC/bank status persistence and verified Razorpay Route linked-account reference.
- Razorpay Route payout adapter: separate explicit activation flag, transfer release on eligible seller sub-orders, atomic in-progress guard, unknown outcome state, transfer webhook reconciliation, automatic transfer option after all gates and a configurable 7-day default payout hold are met, and duplicate manual payout protection.
- Provider-verified refund reconciliation: admin can query the exact Razorpay refund ID and verify matching payment ID, amount and status; Route seller transfer blocks customer refund until reversal/reconciliation.
- Independent seller sub-orders grouped by seller beneath one customer order.
- Seller warehouse management, default dispatch warehouse, product-level inventory, reservations, cancellation release, delivered stock consumption and movement history.
- GST/TCS working ledger with CA-controlled settings, payment-captured seller sub-order accrual, full-return adjustment and monthly CSV export.
- Authenticated native WebSocket concierge chat with persisted messages and REST fallback.
- Admin Marketplace Operations panels for seller status, KYC, sub-orders, Route release, returns, refund verification, concierge inbox and tax reconciliation.
- Seller portal warehouse creation and stock adjustment controls.
- Hinglish owner credential, testing and deployment guides; one-click Windows source checker.

## Source verification completed

- Backend source audit: **79 passed, 0 failed** (after final additions; rerun audit script before delivery).
- Source QA: **23 passed, 0 failed**.
- JavaScript syntax: all 28 frontend/backend JS files checked.
- Admin Marketplace inline JavaScript syntax checked separately.
- CSP SHA-256 hash recomputed for the changed admin inline script.
- SQLite schema blocks and seller-profile forward migrations executed in Python SQLite.
- Seller sub-order upsert, warehouse reserve/consume statements and both monthly tax-report UNION queries exercised in SQLite.
- ZIP integrity/CRC checked after packaging.

## Not possible to certify from this environment

- No Node runtime test against `better-sqlite3` was run because that native dependency is not installed in the current build container.
- No authenticated browser WebSocket end-to-end test was run.
- No real KYC vendor account, hosted onboarding or signed callback was connected.
- No Razorpay Route merchant activation, linked account or test bank transfer was performed.
- No live Razorpay refund, Shiprocket shipment, tracking or reverse pickup test was performed.
- No GST portal filing, GST invoice legal review or CA approval was performed.
- No Railway deployment was submitted from this session; deployment still requires the owner's Railway browser login.

## Remaining owner/provider/legal tasks

1. Choose and activate a KYC provider; configure its hosted onboarding and signed callback using `SELLER_KYC_WEBHOOK_SECRET`.
2. Apply for Razorpay Route and linked-account approval. Set `RAZORPAY_ROUTE_ENABLED=true` only after approval and sandbox verification.
3. Keep `AUTO_ROUTE_PAYOUTS=false` during testing. Enable only after the transfer/refund reconciliation test suite and finance approval.
4. Have a CA confirm operator GST registration, seller GST requirements, TCS rates, place-of-supply, discount/return treatment and filing responsibility before enabling the tax ledger.
5. Finalize seller contracts, KYC policies, return/dispute rules, commission, settlement schedule, warehouses and physical stock.
6. Run the owner checklist, deploy to Railway, verify persistent volume and `/api/health`, then complete test-mode checkout → webhook → shipment → delivery → Route transfer → refund reconciliation.

## Important limitations

- KYC integration is a signed provider callback adapter; the actual KYC provider contract, hosted document collection and bank verification are external.
- Route payout automation is opt-in and uses Razorpay Route. It is not an arbitrary bank transfer system.
- Tax ledger is a working reconciliation export, not a GST invoice/tax engine or filed GSTR-8 return. It does not cover all complex adjustments, cess, partial-item returns or statutory filing.
- Warehouse allocation currently selects the seller's default warehouse; it is not an intelligent multi-warehouse fulfilment optimizer.
- WebSocket live chat is single-service/single-replica. Multi-replica horizontal scaling requires shared pub/sub and a revised shared-state architecture.

Read `OWNER-SETUP-HINGLISH.md`, `OWNER-TEST-AND-DEPLOY-CHECKLIST-HINGLISH.md`, and `MARKETPLACE-ADVANCED-RELEASE-UPGRADE-2026-11-24.md` before enabling any provider or live setting.
