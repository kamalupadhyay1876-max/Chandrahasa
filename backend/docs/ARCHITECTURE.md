# Architecture

- Browser: static HTML/CSS/JS, Three.js for product visualisation; motion enhancements are dependency-free.
- API: Node HTTP server; routes in `server.js`.
- Data: SQLite with `better-sqlite3`, schema/queries in `db.js`.
- Sessions: opaque random cookie token, hashed token in DB; cookie HttpOnly and SameSite=Lax, Secure in production.
- Static files: `public/`; data directory separate.
- Environment: `.env` is local-only and must never be committed.

SQLite is appropriate for a single small instance, not a multi-instance deployment with ephemeral disk. Multi-instance hosting requires shared persistent database storage and a shared rate-limit/session design.
