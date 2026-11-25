# Chandrahasa — Premium UX & Production Upgrade Roadmap

Status: implementation branch `upgrade/premium-ux-production-hardening`  
Date: 25 November 2026  
Product model: single-owner, single-store commerce

## Product outcome

Build a premium, clear, fast and dependable jewellery storefront with a focused owner workspace. Do not equate a long feature list with production readiness. Every feature must have a real backend contract, authorization, empty/loading/error states, tests and operational documentation.

## Design system

- Preserve the warm ivory, ink and restrained antique-gold identity.
- Use a consistent spacing scale, type hierarchy, button sizes, form fields, borders, elevation and radius.
- Keep product photography dominant and product facts easy to scan.
- Prefer calm motion; respect `prefers-reduced-motion`.
- Ensure keyboard-visible focus, readable contrast, accessible labels and 44px-class touch targets.
- Treat desktop, tablet and mobile as separate layouts, not just a shrinking desktop page.

## Workstreams and acceptance gates

### 1. Storefront UX
- Home, shop, search, product, cart, checkout, account and help journeys.
- Search and filters must preserve URL state and provide useful empty/error states.
- Product cards and detail pages must show real catalogue data only; never fabricate reviews, ratings, HUID, stock or material claims.
- Mobile filter controls, navigation and cart must be usable with touch and keyboard.
- Acceptance: browser tests at 360px, 390px, 768px, 1024px and 1440px; no horizontal overflow; core shopping flows pass.

### 2. Admin Studio
- Navigation grouped by Overview, Catalogue, Orders, Customers, Store design, Media and Operations.
- Tables need search, sorting, pagination, bulk actions, confirmation for destructive actions and clear feedback.
- Forms need inline validation, unsaved-change warnings and consistent save/cancel behavior.
- Store customizations need a preview and explicit publish/draft state; only settings with a live renderer may be marked published.
- Acceptance: authenticated CRUD tests for products/categories/orders/coupons/media/settings; server-side role checks for every mutation.

### 3. Commerce correctness
- Atomic checkout and inventory reservation; idempotency for order/payment requests.
- Explicit order/payment/return state machines.
- Signed provider webhooks, reconciliation, refund status verification and failure recovery.
- Never fulfil unpaid online orders or decrement/restore stock twice.
- Acceptance: concurrency, duplicate webhook, retry, cancellation, refund and COD tests.

### 4. Security and privacy
- Owner-only setup/recovery; customer signup never creates privileged roles.
- Session rotation/revocation, secure reset, CSRF, XSS-safe output, strict upload validation and server-side authorization.
- Persistent distributed rate limiting if scaling beyond one process.
- Secrets remain in Railway variables; no credentials in source, logs, browser bundles or support tickets.
- Acceptance: dependency scan, negative authorization tests, upload abuse tests, security-header/CSP checks and a documented recovery drill.

### 5. Performance and accessibility
- Responsive images, lazy loading below the fold, critical-image priority, small JS and cache headers for immutable assets.
- Avoid unsafe caching of account, cart, admin or personalized responses.
- Semantic landmarks, accessible names, keyboard operation and reduced-motion support.
- Acceptance: measured Core Web Vitals on representative mobile; Lighthouse performance/accessibility reports with regressions tracked.

### 6. Operations and release
- Database migrations, structured logs, error reporting, backup retention, integrity verification and restore drills.
- One Railway production service with one SQLite writer unless the database architecture is deliberately migrated.
- GitHub Actions gates for syntax, unit/schema, API integration, browser regression and dependency audit.
- Staged rollout, smoke tests, rollback plan and post-deploy health verification.

## Success metrics (baseline first; targets after measuring)

| Metric | Initial target |
|---|---|
| Mobile layout | No horizontal overflow at 360–430px |
| Search | p95 response under 500ms at expected catalogue size |
| Storefront LCP | Aim for <= 2.5s on representative mobile |
| Interaction | Aim for INP <= 200ms |
| Layout stability | Aim for CLS <= 0.1 |
| Checkout | 100% idempotent order creation under retry tests |
| Inventory | No negative stock under concurrency tests |
| Admin security | 100% of admin mutations denied to non-admin sessions |
| Backup | Daily verified backup and successful scheduled restore drill |
| Release | No deploy without passing CI and post-deploy smoke test |

## Current implementation in this branch

- Added an additive premium storefront refinement stylesheet with focus states, responsive shop/product/checkout spacing, improved form/filter affordances and reduced-motion support.
- Added an isolated responsive Admin Studio stylesheet; admin navigation remains horizontally accessible on tablet/mobile rather than disappearing.
- Linked the new styles to primary storefront and account pages.
- Added source-audit regression checks for stylesheet inclusion, mobile admin navigation and accessibility CSS.

## Explicitly not claimed complete

This branch now includes the listed visual and interaction changes, but it still does not implement every item above. Payment-provider credentials, live refund/shipping flows, authenticated end-to-end Admin CRUD, media upload/restore drills, full settings-to-storefront rendering, load testing and independent penetration testing must each be verified separately. Keep SQLite single-writer deployment constraints unless a tested database migration is completed.
