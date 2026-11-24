# Deploy Chandrahasa to Render (persistent SQLite)

This blueprint deploys the existing Node server and mounts persistent storage for SQLite. It is the simplest supported hosted path without rewriting the synchronous database layer.

1. Push this folder/project to a private Git repository.
2. Render dashboard → New → Blueprint → select repository → review `render.yaml`.
3. Supply the secret values for Razorpay, Shiprocket and mail provider in the Render environment panel. Generated `SECRET` is created by Render.
4. Deploy, then check `/api/health`.
5. Verify admin login, a test-mode payment, webhook delivery, shipping sandbox and database backup before live mode.

The SQLite database is mounted at `/var/data/chandrahasa.db`. Do not remove the disk or deploy multiple server instances: this app is currently single-instance SQLite, not horizontally scalable. Render disk snapshots are not a substitute for scheduled logical backups and restore drills.

## Launch checklist
- [ ] Set a custom domain and HTTPS
- [ ] Confirm secrets are not committed
- [ ] Configure Razorpay webhook URL `/api/payments/webhook` and its secret
- [ ] Verify webhook events and refunds in test mode
- [ ] Verify Shiprocket sandbox, pickup location, package dimensions and weights
- [ ] Create a restricted admin account; remove demo data/accounts
- [ ] Test backup restoration and operational recovery
- [ ] Review tax, invoice, privacy, return and warranty terms
- [ ] Run browser regression suite on the deployed URL
