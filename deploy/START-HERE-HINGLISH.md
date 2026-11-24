# Chandrahasa — one-command Railway upload

## Windows
1. Extract this ZIP.
2. Open the extracted `Chandrahasa-Full-Project` folder.
3. Right-click `deploy/deploy-railway.ps1` → Run with PowerShell (or open PowerShell in this folder and run `Set-ExecutionPolicy -Scope Process Bypass; .\deploy\deploy-railway.ps1`).
4. Browser opens: sign in to Railway and approve CLI access. This is the only interactive authentication step.
5. Script links the existing Chandrahasa Railway project/service and uploads the current folder with `railway up`.
6. Watch the deployment logs in Railway. The app is not considered live until `/api/health` returns HTTP 200 and storefront/API checks pass.

## macOS / Linux
From this project root: `bash deploy/deploy-railway.sh`.

## Current deployment architecture
- One Railway Docker service serves frontend and backend together.
- SQLite is retained because the application uses synchronous better-sqlite3 throughout its server. Do not set DATABASE_URL and assume PostgreSQL is active.
- Railway persistent volume is already attached at `/data`; DATA_PATH and NODE_ENV are configured in the service.
- One replica only. Do not scale horizontally with SQLite.

## Required after upload
- Confirm build succeeded and `/api/health` responds 200.
- Run browser/API checkout tests with test credentials.
- Add merchant Razorpay and Shiprocket credentials in Railway Variables (never in source files or chat).
- Verify webhook signature/replay, payment success/failure, refunds, COD idempotency, Shiprocket shipment/tracking in sandbox.
- Set up encrypted off-platform backups and test a restore.
- Create/secure the first admin account and confirm business policies/catalogue.

Do not accept live paid orders until those checks are complete. The script uploads source; it cannot authenticate your browser account on your behalf or create merchant credentials.


## Backup / restore
`BACKUP-RESTORE-RUNBOOK.md` mein daily backup, admin backup endpoint aur safe offline restore ke exact steps hain. Dhyan rahe: same Railway volume par backup off-site disaster recovery nahi hota. Off-site encrypted copy aur restore drill ke bina real orders start mat karna.
