# Security release gates

These gates must be verified by tests and configuration, not marked complete merely because code or a prompt says so.

- [ ] Production secret is unique, high entropy, and not present in repo or logs.
- [ ] No demo admin/customer credentials remain; no production seed runs.
- [ ] Payment integration uses gateway order creation, server verification, and signed webhook verification; never trust browser payment status.
- [ ] Order detail, invoice, cancel/return and COD routes enforce owner/admin authorization.
- [ ] CSRF strategy covers state-changing cookie-authenticated routes.
- [ ] Rate limits work across all instances and use a correctly configured proxy boundary.
- [ ] Admin MFA or equivalent protection is configured.
- [ ] Session renewal, expiry, revocation, cleanup and password-reset expiry tested.
- [ ] Server-side validation for all fields, ids, quantities, sizes, coupon values, URLs and file inputs.
- [ ] No raw secrets, reset tokens, payment payloads or sensitive PII in logs.
- [ ] CSP and headers reviewed against every script/font/image; no unsafe exceptions without justification.
- [ ] DB backups and restore drill completed; DB permissions and file paths reviewed.
- [ ] npm audit and dependency review completed; lockfile checked.
- [ ] Browser tests for account ownership, checkout, mobile layout and failure states completed.
- [ ] Business identity, policies, contact details and product claims reviewed by owner.
