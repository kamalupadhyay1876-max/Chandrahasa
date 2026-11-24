# Quick deployment choices

**Recommended current app:** Render Blueprint (`render.yaml`) with persistent disk. This avoids the ephemeral filesystem risk and preserves SQLite.

**Supabase:** optional Storage for catalogue media is prepared with a migration; it is not yet a replacement for SQLite. See `SUPABASE.md`.

**Vercel:** not recommended for this current SQLite server without a database/storage refactor. Serverless instances and ephemeral storage conflict with the current persistence design.

**Local Windows:** copy `.env.example` to `.env`, install Node 20+, run `setup_run.cmd`.
