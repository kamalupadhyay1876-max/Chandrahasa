# Chandrahasa — Owner-ready patch report (24 Nov 2026)

## Changes in this package

1. Fixed product Q&A initialization: it now mounts after the product API resolves instead of returning while `state.product` is still null.
2. Changed customer review rendering to create DOM nodes and assign untrusted review author/title/body values through `textContent`, avoiding HTML injection through review content.
3. Added `OWNER-SETUP-HINGLISH.md` with exact provider accounts, Railway variable names, where credentials belong, and sandbox go-live gates.
4. Added `deploy/OWNER-CHECK-WINDOWS.cmd` so a Windows owner can double-click a readiness/source check without typing commands.
5. Added source QA assertions for the Q&A timing fix, review text rendering, and owner setup assets.

## Verification performed in this workspace

- `node --check frontend/js/product.js`: passed.
- `python3 QA-SOURCE-CHECKS.py`: **15/15 passed**.
- `node backend/scripts/audit.js`: **69 passed, 0 failed**.
- Existing source JS syntax checks: passed (28 files counted by QA).
- ZIP integrity: verified after packaging.

## Not performed

- Native `better-sqlite3` is not installed in this workspace, so the Node server/database migration and DB-backed integration tests were not executed.
- Playwright browser E2E was not run.
- No Razorpay or Shiprocket sandbox credentials were available; no payment capture, webhook, refund, shipment, reverse pickup or tracking event was tested against merchant accounts.
- No OpenAI API key was configured; visual/semantic AI quality was not tested against the provider.
- No Railway deployment was initiated and no live order lifecycle was certified.

## Owner setup is intentionally limited to credentials and account approvals

The owner guide identifies exactly which account credentials can be entered in Railway Variables. KYC provider integration, automated bank payouts, GST/TCS, independent seller sub-orders/warehouse fulfilment, and true WebSocket live chat are not represented as completed. Seller KYC/bank verification and payouts remain manual review/settlement workflows. Do not enable third-party live sales until marketplace compliance and settlement operations are approved.

## Release label

**Owner-ready source candidate; not production-certified.** A green source audit is not proof of real payment, shipping, refund or disaster-recovery success.
