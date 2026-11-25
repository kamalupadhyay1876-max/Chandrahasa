# Chandrahasa owner account recovery and database backups

## Admin entry point
Owner sign-in and first-owner setup are available only at `/admin`. Customer signup at `/signup` never accepts an owner setup key and cannot promote a customer. The first account can become Admin only when the database has zero users, the request comes from the /admin setup form, and the one-time `OWNER_SETUP_KEY` matches.

## If the setup key is lost
The setup key is not a login credential and is not needed after the first Admin exists. Sign in with the Owner email and password. If the password is lost, use the email reset flow when `RESEND_API_KEY` is configured. If the email account is unavailable, use the private Railway service shell:

```sh
cd /app
ADMIN_EMAIL='the-existing-owner-email' ADMIN_PASSWORD='new-random-16+-character-password' RECOVERY_CONFIRM='I_AM_THE_STORE_OWNER' node scripts/recover-admin.js
```

The recovery script requires an existing account, never creates a new account, will not overwrite a different existing Admin, revokes old sessions, and does not print the password. Use Railway's private shell only; never place these values in GitHub, a public URL, browser console, or chat. Remove the environment values after the command.

If no Admin exists but an existing customer account does, the script can promote that exact existing account after the explicit shell confirmation. If an Admin already exists, the script only resets that Admin's password.

## Automatic and manual backups
Production creates a verified SQLite online backup shortly after startup and then every 24 hours. Backups are stored under `/data/backups` on the persistent Railway volume. At least seven days are retained (default 30 days). The Admin Studio Backups tab can create an additional backup and download a backup only after its SHA-256 checksum is verified.

Keep a downloaded backup somewhere separate from Railway. A backup stored only on the same Railway volume does not protect against volume loss.

## Restore
Restore is deliberately offline to avoid replacing a live SQLite database while requests are running:

1. Download a backup from Admin Studio and keep its matching `.sha256` file.
2. Stop the Railway service / ensure it is not serving requests.
3. Put both files under `/data/backups` (or another private path).
4. Run `npm run db:restore -- /data/backups/chandrahasa-YYYY-MM-DDTHH-MM-SS-sssZ.sqlite`.
5. Restart the service and verify `/api/health`, owner login, products, customers, orders, and payments.

The restore script checks the checksum and SQLite integrity and creates a fresh safety backup of the current database before replacement. Never restore an untrusted or checksum-mismatched file.

## Media uploads
Admin image uploads accept JPEG, PNG, WebP and GIF up to 8 MB each. Files are stored in `/data/uploads` with random filenames and are served as inert image content. SVG is intentionally not accepted to avoid active-content uploads. Include the `/data` volume in your backup plan; database backups do not include uploaded image files, so separately copy `/data/uploads` periodically.

## Important
A lost account password, a lost setup key, and a lost database are different recovery events. Backups protect data; the private recovery script restores account access. Neither should be used to bypass payment verification, audit logs, or authorization checks.
