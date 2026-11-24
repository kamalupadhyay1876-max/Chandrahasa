# Chandrahasa — 40-point commerce & launch review

This list is a launch scope and audit map. Status means the feature exists in the package or has been externally verified; it does not imply a sandbox or production test passed.

## Existing package capabilities (source-present, runtime verification still required)
1. Responsive storefront and product catalogue
2. Collection/category navigation
3. Product-detail pages and gallery
4. Jewellery material/purity/HUID fields
5. Search and browse experience
6. Cart with quantity handling
7. Wishlist
8. Customer signup/login
9. Customer account page
10. Password reset flow
11. Guest order lookup with confirmation token
12. Checkout/order creation
13. COD flow
14. Razorpay order-create path
15. Razorpay checkout signature verification path
16. Razorpay webhook path
17. Webhook event duplicate guard
18. Stock decrement conditional guard
19. Late-capture stock exception handling path
20. Payment reconciliation endpoint
21. Refund request endpoint
22. Refund/payment state storage
23. Shiprocket create-shipment endpoint
24. Shiprocket tracking endpoint
25. Order tracking fields and fulfilment UI
26. Admin product management
27. Admin order management
28. Admin coupons
29. Admin customers
30. Admin analytics/low-stock view
31. Operations management UI
32. Category/settings management
33. Contacts/newsletter/review moderation surfaces
34. Admin audit log
35. Seed opt-in guard
36. Static source audit
37. Browser test script
38. SQLite persistence and schema upgrades
39. Supabase Storage bucket migration draft
40. PostgreSQL core/commerce migration groundwork

## Additional launch requirements — not represented as completed
- [ ] PostgreSQL async runtime conversion and adapter
- [ ] Supabase DB cutover with rollback and data migration
- [ ] Postgres contention tests (stock, reservation, payment state)
- [ ] Razorpay sandbox: duplicate webhook, delayed webhook, failure/capture race, refund partial/full/replay, reconciliation
- [ ] Shiprocket sandbox: create retry, duplicate shipment guard, AWB tracking, timeout and backoff
- [ ] Transactional outbox worker actually running and observed
- [ ] Reservation expiry worker actually running and observed
- [ ] Multi-instance shared rate limiting
- [ ] Admin MFA and recovery codes
- [ ] CSRF review/test across every mutating endpoint
- [ ] CSP review and browser console/error review
- [ ] Monitoring/alerting and incident runbook
- [ ] Scheduled backup and documented restore drill
- [ ] Load test, accessibility review, mobile browser matrix
- [ ] GST/HSN invoice, privacy, returns, warranty and terms review by owner/advisor
- [ ] Production secrets, HTTPS, domain, DNS, email sender, payment webhooks and Shiprocket pickup configured

## Release decision
This archive is a pre-production handover candidate. Live payment enablement should remain disabled until every critical external gate above is verified. This list must not be used as a claim of Amazon-level equivalence or independent certification.
