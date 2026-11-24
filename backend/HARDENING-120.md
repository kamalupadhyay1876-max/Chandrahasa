# Chandrahasa: 120-point hardening, QA & UX backlog
## Status legend
- **Implemented in this package:** change present in code or configuration and syntax/basic checks run.
- **Needs external configuration:** code/UI depends on provider credentials, host controls, or account settings.
- **Not claimed complete:** requires independent test, deployment, provider, or security specialist verification.

## Security (1-25)
1. Use unique production secret (production startup already rejects weak secret) — Implemented
2. Keep secrets in environment variables — Implemented / configuration
3. Never expose payment simulation — Implemented (online checkout disabled)
4. Never trust client prices — Implemented in order route
5. Validate active product IDs — Implemented
6. Validate order quantity bounds — Implemented
7. Check stock on order — Implemented
8. Transactional stock decrement — Implemented
9. Password hashing — Implemented (scrypt)
10. Session tokens are random — Implemented
11. Store session token hashes — Implemented
12. HttpOnly session cookies — Implemented
13. SameSite cookie — Implemented
14. Secure cookies in production — Implemented
15. Admin RBAC — Existing implementation; test required
16. Rate limit signup — Existing implementation
17. Rate limit login — Existing implementation
18. Rate limit reset — Existing implementation
19. Generic reset response — Existing implementation; test required
20. Request body size cap — Implemented
21. SQL parameters — Existing prepared statements
22. Static path traversal guard — Existing; test required
23. Security headers — Existing
24. CSP — Existing; test browser compatibility
25. Cross-origin mutation checks — Existing; test deployment proxy

## API/auth/order controls (26-45)
26. Auth on admin routes — Existing
27. Role validation — Existing
28. Authenticated order history — Existing
29. COD confirmation ownership check — Existing, review required
30. Online payment verification blocked until real integration — Implemented
31. Webhook integration — Not implemented; external integration required
32. Razorpay credentials — External config
33. Coupon server-side lookup — Implemented
34. Coupon eligibility validation — Implemented
35. Coupon concurrency/race protection — Needs further work
36. Duplicate order idempotency — Needs further work
37. Email verification — Needs provider/config and tests
38. Password reset provider — Needs provider/config
39. Session revocation UX — Needs work
40. Admin MFA — Not implemented
41. CSRF strategy — Needs dedicated review
42. Trusted proxy/IP config — Needs deployment review
43. Persistent rate limiting — Needs infrastructure for multi-instance
44. CAPTCHA — External provider integration not included
45. Audit logging — Existing admin audit logs

## Database & reliability (46-65)
46. SQLite schema — Existing
47. Parameterized SQL — Existing
48. Stock transaction — Implemented
49. Index review — Needs DB query profiling
50. Migration strategy — Needs formal migrations
51. Backup schedule — Hosting/config required
52. Restore test — Not run
53. Monitoring — External provider/config required
54. Health endpoint — Needs implementation/deployment validation
55. Structured logs — Needs further work
56. Error tracking — External config
57. Alerting — External config
58. Graceful shutdown — Needs implementation/test
59. DB WAL handling — Existing DB setup, review required
60. Multi-instance DB strategy — Needs migration before scaling
61. Queue — Not implemented
62. Email retry queue — Not implemented
63. Caching — Not implemented
64. CDN — Host configuration
65. Auto scaling — Host configuration

## Frontend/UX/accessibility (66-90)
66. Mobile viewport — Review/tests required
67. Responsive nav — Existing; test required
68. Keyboard focus styles — Implemented
69. Reduced-motion preference — Implemented
70. Scroll reveal — Implemented
71. Scroll progress — Implemented
72. 3D tilt hover — Implemented
73. Floating motion class — Available
74. Shimmer hover class — Available
75. Image zoom hover class — Available
76. Glow hover class — Available
77. Stagger reveal class — Available
78. Orbit animation class — Available
79. Pulse animation class — Available
80. Hero parallax — Existing 3D scene; test required
81. Mobile motion fallback — Implemented
82. Animation dependency — No added library
83. Placeholder audit — Needs human content audit
84. Broken link audit — Needs automated full crawl
85. Button interaction audit — Needs full test
86. Image alt audit — Needs full audit
87. Image compression — Needs full asset audit
88. Loading skeletons — Needs broader implementation
89. Empty states — Needs audit
90. Toast/error consistency — Needs audit

## SEO, commerce, admin, operations (91-120)
91. Page title — Existing, audit required
92. Meta description — Existing, audit required
93. OpenGraph — Existing, audit required
94. Canonical — Existing, audit required
95. JSON-LD — Existing; factual claims review required
96. Sitemap — Needs validation/generation
97. robots.txt — Needs validation
98. Custom 404 — Existing
99. Favicon — Existing
100. Checkout server totals — Implemented
101. COD order flow — Implemented; test required
102. Online payment — Disabled pending genuine gateway integration
103. Shipping integration — Not implemented
104. Order status lifecycle — Existing
105. Admin fulfilment — Existing
106. Admin audit trail — Existing
107. Admin log review — Existing
108. Admin MFA — Not implemented
109. Product image upload validation — Needs admin upload feature/review
110. Private customer file storage — Not currently used/needs setup
111. Customer review moderation — Existing admin endpoint
112. Contact form spam defense — Needs CAPTCHA/provider
113. Product HUID validation — Per product data and real-world validation
114. BIS claims — Verify each item before publishing
115. Returns claim — Verify policy/content
116. Shipping claims — Verify policy/content
117. Analytics privacy — Needs choice/config
118. Uptime monitoring — External setup
119. Dependency vulnerability scan — Run before release
120. Independent penetration test — Not run

## Release gate
This ZIP is a hardening and motion enhancement bundle, **not a certification or guarantee of 120 completed security fixes**. Use COD-only until a real gateway flow with signed webhook and payment verification is integrated. Configure a strong secret, HTTPS, persistent database storage, backups, monitoring, and run the included tests before production.
