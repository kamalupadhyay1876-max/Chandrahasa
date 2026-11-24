# Deployment reality and launch procedure

The included Render descriptor describes a deploy target; no remote deployment has been made from this archive. A deployment needs the owner's hosting account and credentials, DNS/domain choices, provider credentials and environment configuration.

## Demo deploy (SQLite)
1. Create a Render account and new Blueprint deployment using the repository containing this project and `render.yaml`.
2. Configure the persistent disk path as `/var/data` as described in `render.yaml`.
3. Add provider credentials only through host environment settings; never commit `.env`.
4. Keep Razorpay keys in test mode, configure webhook endpoint and secret, and test the entire order journey.
5. Check health endpoint, logs, persistence after restart and backup procedure.

## Supabase is not a selectable DB switch yet
The runtime currently uses synchronous `better-sqlite3` APIs throughout the Node server. The migration SQL is groundwork and does not constitute a PostgreSQL adapter. Setting `SUPABASE_URL`/`DATABASE_URL` alone will not convert the runtime. Do not deploy expecting PostgreSQL to be used.

## Production gates
Complete the async PostgreSQL port; run migration against a disposable staging database; verify seed/data migration; run automated race tests and payment/shipping sandbox suites; run restore drill and security review; configure monitoring and alerting; only then consider enabling live payment keys.
