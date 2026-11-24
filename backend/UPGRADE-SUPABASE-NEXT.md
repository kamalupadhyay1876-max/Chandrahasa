# Next upgrade handoff

Added PostgreSQL integrity primitives in `supabase/migrations/202611230002_commerce_integrity.sql`, migration/cutover notes in `docs/SUPABASE-POSTGRES-MIGRATION-STATUS.md`, and a race-test specification in `tests/RACE-TEST-MATRIX.md`.

**Do not treat this as the completed PostgreSQL migration.** The runtime is still SQLite. This upgrade is intentionally a staged migration artifact to avoid claiming that the synchronous SQLite codebase has been ported when it has not. Full port requires async repository conversion, schema/data migration, route refactoring, and tests.
