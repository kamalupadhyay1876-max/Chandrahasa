# Supabase PostgreSQL migration status

## Status: groundwork delivered; application cutover NOT delivered

The application currently uses a synchronous `better-sqlite3` API in roughly 130 server query sites and synchronous transaction callbacks. A safe PostgreSQL cutover requires changing these to async DB calls, adapting parameter syntax/SQL dialect, transaction boundaries, schema/seed/migrations, and verifying every route. This package therefore **does not** falsely claim that setting `SUPABASE_DB_URL` makes the app run on Supabase.

Migration `202611230002_commerce_integrity.sql` creates PostgreSQL ledger, reservation, refund and outbox primitives and an atomic inventory helper. It is supplemental and assumes the application's `products` table has a compatible `id` and `stock` column; verify types and deploy order before applying. It is not a full schema conversion nor a dual-write bridge.

## Recommended cutover stages
1. Provision Supabase project; use a direct PostgreSQL connection string (or session pooler for app connections; transaction pooler only after compatibility checks). Never expose service-role credentials in browser code.
2. Convert schema and data using an explicit mapping/export/import process; reconcile row counts, constraints, JSON fields, integer currency units and timestamps.
3. Replace sync adapter with an async repository interface; use parameterized queries and transaction-scoped connections. No request handler may issue SQLite-specific SQL.
4. Implement reservation, webhook ledger and refund operations as transaction-level DB functions; ensure event IDs, gateway IDs and refund idempotency keys are unique.
5. Run shadow comparison on read paths; then staging cutover with payment gateway test mode and carrier sandbox.
6. Test rollback from snapshot and write freeze plan. Do not dual-write without consistency monitoring.
7. Cutover only after E2E, concurrency, backup/restore, operational alert and security acceptance evidence.

## Acceptance gates
- Duplicate webhook replay is a no-op (same event ID).
- Two concurrent attempts for final stock cannot both reserve it.
- Failure/timeout release and capture reconciliation are idempotent.
- Late capture with unavailable stock enters explicit exception state and alert.
- Refund requests cannot exceed captured minus already refunded amount; retries use the same idempotency key.
- Outbox retry is bounded and dead-letter items alert.
- Database restore, RLS review (if browser-facing), secrets review and penetration testing completed.
