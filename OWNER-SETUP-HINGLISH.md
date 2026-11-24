# Chandrahasa — Owner Setup (Hinglish, no coding)

Yeh guide non-technical owner ke liye hai. Aapko code edit nahi karna. Sirf provider accounts banana, test credentials copy karna aur Railway Variables mein paste karna hai.

## Sabse pehle: safety

- API keys/passwords mujhe chat mein, WhatsApp par, screenshots mein, ya ZIP/GitHub mein mat bhejna.
- Keys sirf Railway → Chandrahasa service → Variables mein paste karni hain.
- Pehle TEST/SANDBOX credentials use karein. Live credentials tabhi jab test order, refund aur shipment lifecycle pass ho.
- `SECRET` ko kabhi change/share na karein jab tak backup aur maintenance window ready na ho.
- Railway volume `/data` aur `DATA_PATH=/data/chandrahasa.db` ko retain karein. SQLite deployment ko one replica par rakhein.

## A. Required owner accounts

| Account | Kahan jaana hai | Aapko kya banana hai | Railway variable |
|---|---|---|---|
| Railway | https://railway.com | Project/service access; billing/usage review | Existing deployment account |
| Razorpay | https://dashboard.razorpay.com | Test mode API key pair + webhook secret | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| Shiprocket | https://app.shiprocket.in | API user/email + password; pickup location | `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION` |
| Resend (optional) | https://resend.com | API key + verified sender/domain | `RESEND_API_KEY`, `MAIL_FROM` |
| OpenAI (optional) | https://platform.openai.com/api-keys | API key + billing limit | `OPENAI_API_KEY` |
| Sentry (optional) | https://sentry.io | Server-side project DSN | `SENTRY_DSN` |

**Important:** Razorpay dashboard mein webhook URL deployment ke baad `https://YOUR-DOMAIN/api/payments/webhook` set karein. Events mein `payment.captured`, `payment.failed`, `refund.created`, `refund.processed`, `refund.failed`, `transfer.processed`, `transfer.reversed`, `transfer.failed` select karein. Same webhook URL payment and Route events ke liye use hoga. Webhook secret ko `RAZORPAY_WEBHOOK_SECRET` mein hi rakhein.

Shiprocket ke pickup location ka naam dashboard mein jo exact hai wahi `SHIPROCKET_PICKUP_LOCATION` mein likhein. Account activation, KYC, pickup address aur courier serviceability Shiprocket ke approval par depend karte hain.

## B. Railway mein credentials paste karna

1. Railway dashboard kholein: https://railway.com
2. Chandrahasa project → `chandrahasa-store` service kholein.
3. `Variables` tab kholein.
4. `New Variable` par click karein.
5. Variable name aur value upar wali table ke mutabik paste karein.
6. Har required variable save karein. Railway redeploy kare to deployment logs check karein.
7. Secret value ka screenshot/share mat karein.

## C. Kaunse features credentials ke bina chalenge?

- Storefront, catalogue, cart, wishlist, customer accounts, COD order creation, addresses, returns request, compare, FAQ, support inbox, seller application/review and basic recommendations.
- Razorpay online payment/refund tabhi jab valid merchant keys aur webhook secret hon.
- Shiprocket shipment/return pickup tabhi jab account active ho, pickup location set ho aur courier service available ho.
- AI visual search/semantic embeddings tabhi jab `OPENAI_API_KEY` set ho. Without key, visual search uses a limited local colour/keyword fallback; it is not AI visual recognition.
- Email delivery tabhi jab Resend API key and verified sender configured ho.

## D. Marketplace / seller compliance — owner actions

Project mein ab seller-wise sub-orders, warehouse inventory reservations/movements, KYC provider webhook adapter, Razorpay Route transfer release gate, GST/TCS working ledger aur monthly CSV reconciliation workspace add kiya gaya hai. Third-party seller selling default se approved/verified seller par hi enable hoti hai.

**Seller KYC provider:** Aapko apna KYC vendor (Digio / HyperVerge / Signzy ya jo provider aap select karein) ka merchant account activate karna hoga. Provider ko webhook URL `https://YOUR-DOMAIN/api/marketplace/kyc/webhook` dena hai. Provider webhook ka raw request body HMAC-SHA256 se sign kare aur signature `X-Chandrahasa-KYC-Signature` header mein bheje. Railway variable `SELLER_KYC_WEBHOOK_SECRET` mein wahi shared secret rakhein. JSON event fields: `eventId`, `sellerId`, `provider`, `kycStatus` (`under_review|verified|rejected`), `bankStatus` (`pending|verified|rejected`), `linkedAccountId` (Razorpay Route `acc_...` account ID). Duplicate event IDs safe/idempotent hain. Provider ka hosted onboarding, document capture, legal verification aur bank penny-drop provider-side par activate/contract karna hoga; app khud KYC approval invent nahi karta.

**Razorpay Route:** Ordinary Razorpay Payment Gateway key alone enough nahi. Razorpay se Route/Linked Accounts approval alag se lena hoga. Test mode mein Route linked accounts, account verification, transfer and transfer webhooks enable karwayein. Provider KYC webhook tabhi `linkedAccountId` bheje jab woh actual verified Razorpay Route account ID ho. Route approval milne ke baad hi Railway variable `RAZORPAY_ROUTE_ENABLED=true` karein; default `false` hai aur release button hidden rahega jab tak enabled na ho. Seller sub-order payout sirf captured payment + delivered order + verified KYC + verified bank + linked account par admin ke explicit `Release via Razorpay Route` action se chalega. Duplicate release guard hai; unknown result ko Razorpay dashboard mein reconcile kiye bina retry mat karein. Existing manual payout flow Route-linked sellers ke liye block hota hai, taaki double payout na ho. Refund action bhi seller transfer exist hone par block hota hai jab tak Route transfer reverse/reconcile na ho.

**GST/TCS:** Admin → Marketplace Operations mein GSTIN aur TCS rate CA ke written confirmation ke baad hi set karein. Default disabled/zero hai. App payment-captured seller sub-orders par working TCS ledger banata hai, full return received/refunded par adjustment entry banata hai aur month-wise CSV deta hai. Ye GSTR-8 filing, GST invoice tax engine, legal classification, supplier reconciliation, interest/late fee calculation ya CA sign-off ka replacement nahi. GST portal ke Form GSTR-8 help ko CA ke saath verify karein: https://tutorial.gst.gov.in/userguide/returns/FAQs_GSTR-8.htm.

**Warehouses:** Seller Portal mein warehouse add karein, product-wise on-hand stock set karein. Checkout reserved stock track karta hai; delivery par stock decrement aur cancellation par reservation release hoti hai. Agar seller warehouse inventory entry nahi banata, existing central catalogue stock fallback rahega. Physical counts and returns inspection owner/seller ko verify karna hoga.

**Live chat:** Customer support page aur admin marketplace inbox authenticated WebSocket (`/ws/chat`) par live messages exchange karte hain; connection fail ho to secure REST inbox fallback rehta hai. Railway par one service instance and sticky same-origin WebSocket connection use hota hai; multiple replicas ke liye Redis/pub-sub adapter abhi nahi.

**Abhi bhi owner/CA/provider approval required:** KYC provider account + webhook configuration, Razorpay Route activation, GST/TCS applicability/rates and GSTR-8 filing, seller agreement/commission/return policy, warehouse addresses and physical stock. Seller marketplace ko tab tak public launch na karein.

## E. Payment/shipping go-live test list

Sandbox/test mode mein ye sab pass karna mandatory hai:

- [ ] Successful Razorpay payment → order paid exactly once
- [ ] Failed/cancelled payment → order remains unpaid; retry safe
- [ ] Duplicate webhook → no duplicate payment/order/stock movement
- [ ] Invalid webhook signature → rejected
- [ ] Full and partial refund → provider result reconciled to order
- [ ] COD order → one order only after repeated submit
- [ ] Shiprocket shipment creation → one shipment/AWB only
- [ ] Tracking webhook/status → order timeline updated
- [ ] Return request → approval → reverse pickup → item received → refund
- [ ] Backup created, downloaded off-site, and restored in a separate test environment

## F. One-click checks

Windows owner: double-click `deploy/OWNER-CHECK-WINDOWS.cmd`. It checks source syntax/audit and shows missing credential categories without printing secret values.

Manual health check after deploy: open `https://YOUR-DOMAIN/api/health`. HTTP 200 is necessary, but not enough to certify checkout.

## G. Honest launch status

A successful ZIP check or source audit is not a live payment/shipping test. No production launch claim until real sandbox logs and full customer-to-order-to-payment-to-shipping-to-return test are recorded. Keep online payment and third-party seller sales disabled until those gates pass.

## G. New marketplace release features

- Admin page: `/admin-marketplace` (sign in as admin).
- Seller portal: `/seller-portal` (seller account required).
- Live customer chat: `/support`; admin replies from Marketplace Operations inbox.
- Seller sub-orders, warehouses, inventory reservations and Route payout release are documented in `MARKETPLACE-ADVANCED-RELEASE-UPGRADE-2026-11-24.md`.
- Never turn on `RAZORPAY_ROUTE_ENABLED` before Razorpay Route approves the merchant and linked-account setup. It is `false` by default.
- Tax settings are disabled by default. Do not enable without CA confirmation. CSV is a reconciliation aid, not GSTR-8 filing.


Detailed no-code owner test and deploy sequence: `OWNER-TEST-AND-DEPLOY-CHECKLIST-HINGLISH.md`.
