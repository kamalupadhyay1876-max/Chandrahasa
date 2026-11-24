# Chandrahasa — SQLite backup and restore runbook

## What is implemented
- SQLite online backup API (`better-sqlite3` backup), which is consistent while the app is accepting traffic and includes committed WAL data.
- Backup file integrity check plus SHA-256 sidecar checksum.
- Automatic backup 1 minute after production boot and every 24 hours while the single Railway replica is running.
- Retention pruning; default 30 days, configurable from 7 to 90 days.
- Admin-only backup list/create endpoints: `GET /api/admin/backups` and `POST /api/admin/backups` (normal session + CSRF protections apply).
- Offline restore script validates checksum, SQLite integrity and required commerce tables, then makes a fresh safety backup before replacing the DB.

## Railway configuration
- Persistent volume must remain mounted at `/data`.
- `DATA_PATH=/data/chandrahasa.db`
- Optional `BACKUP_DIR=/data/backups`
- Optional `BACKUP_KEEP_DAYS=30`
- Keep exactly one replica. Do not put this SQLite app behind multiple writers.

## Manual backup
From the backend directory (or container shell):

```bash
npm run db:backup
```

Backups are written to `/data/backups` by default. Admin UI/API can create and list backups after the new version is deployed.

## Restore (maintenance window; stop the Railway service first)
1. Download/select a verified `.sqlite` file and its matching `.sqlite.sha256` file.
2. Stop the service so no process has the database open.
3. Open a shell in the same persistent volume/container and run:

```bash
DATA_PATH=/data/chandrahasa.db BACKUP_DIR=/data/backups npm run db:restore -- /data/backups/chandrahasa-YYYY-MM-DDTHH-MM-SS-sssZ.sqlite
```

4. Restart the service.
5. Verify `/api/health`, customer sign-in, product stock, recent orders, payment records and admin order list.
6. Keep the safety backup generated immediately before restore until the restored store has been checked.

## Important disaster-recovery limitation
The automatic backups in this release are on the same Railway volume as the live database. They protect against accidental data changes and some logical corruption, but they are NOT off-site disaster recovery: deletion/loss of the volume can also lose its backups. Before accepting real orders, configure an independent encrypted S3-compatible backup destination (or another provider/account) and test downloading/restoring a copy from it. Do not describe same-volume copies as off-site backups.

## Restore safety
- Never call restore while the app is running.
- Never upload a raw production database to a public bucket.
- Protect backup files as sensitive customer/order data; restrict access and encrypt off-site copies.
- The restore endpoint is deliberately not exposed over HTTP.

## Admin console
Open **Admin → Business Control Room → Database backups**. An administrator can list existing snapshots and request a new online backup. The UI only reports whether a checksum sidecar exists; the backup creation response reports the SHA-256 and SQLite integrity check result. The UI does not offer remote restore because replacing a live SQLite database over HTTP is unsafe.
