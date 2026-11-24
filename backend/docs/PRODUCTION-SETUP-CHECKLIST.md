# Setup, deploy and client launch checklist

## Local development (Windows)
1. Install Node.js 20+ (recommended current LTS).
2. Extract archive; never deploy from a ZIP preview.
3. Copy `.env.example` to `.env` and set a random SECRET (32+ characters; use a secret manager for production).
4. Run `setup_run.cmd`, or `npm install` and `npm start` in a terminal.
5. Open `http://localhost:3000`.
6. Run `npm run audit`. The static checks are not a penetration test.
7. Seed only a local demo using the explicit seed guard. Never run demo seeding on production.

## Client setup prerequisites
- Client supplies domain, business identity, approved product content/images, privacy/terms/returns/warranty, tax/invoice requirements, shipping rules, support contact and bank/payment account ownership.
- Create provider accounts in client ownership. Configure Razorpay test keys and webhook secret, then test events. Keep keys server-side.
- Configure Shiprocket account, pickup address and weight/size units; test orders only.
- Use persistent host storage for SQLite runtime. SQLite multi-instance hosting is not supported by this package's current runtime.
- Configure TLS, environment secrets, backups, alerts, log retention and access controls.
- Run tests and obtain owner acceptance before moving to production provider keys.

## Supabase/Postgres warning
SQL migration groundwork is included, but the application runtime is still SQLite (`better-sqlite3`). Applying these SQL migrations does not convert or cut over the runtime. Do not configure this as a production PostgreSQL store until the async adapter, data migration, route conversion and tests have been completed.

## Launch gates
- [ ] Build/install succeeds on target host and dependencies are reviewed
- [ ] Secret is unique and managed outside source control
- [ ] Production seed/demo users absent
- [ ] Payment sandbox flows pass, webhook signing and idempotency verified
- [ ] Stock concurrency/recovery tests pass
- [ ] Shipping provider sandbox tests pass
- [ ] Refund reconciliation and manual exception handling pass
- [ ] Admin authorization, CSRF and rate-limiting reviewed
- [ ] Backups and restore drill pass
- [ ] Accessibility/mobile/browser and load checks reviewed
- [ ] Product, tax and legal claims approved by business owner
- [ ] Monitoring and incident contact established
- [ ] Owner accepts release and credentials are rotated/secured
