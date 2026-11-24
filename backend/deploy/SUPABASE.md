# Supabase use with Chandrahasa

Supabase is configured here as an optional **catalogue-media Storage** service, not as the transactional database. The application still uses `better-sqlite3` synchronously; switching its tables to Supabase/Postgres requires a database adapter rewrite and migration/transaction testing, so Supabase credentials alone will not switch the database.

## Storage setup
1. Create a Supabase project.
2. In SQL Editor, run `supabase/migrations/202611230001_catalog_storage.sql`.
3. Keep service-role keys private. Never put a service-role key in browser code or commit it.
4. Authenticated policies in the migration are broad for authenticated users; before enabling uploads in a live admin UI, implement staff-role restrictions and audit them. The current storefront does not yet use the Storage API for admin uploads.

## Planned database migration (not represented as completed)
- Define PostgreSQL schema and constraints matching all SQLite tables.
- Replace synchronous database calls with an async repository layer.
- Add migrations and dual-run/validation tooling.
- Verify sessions, password reset, order locking, inventory reservations, payment ledger, webhook idempotency and refunds under concurrent transactions.
- Run data migration, checksums and rollback rehearsal.
- Only then switch transactional DB and claim Supabase-backed runtime.
