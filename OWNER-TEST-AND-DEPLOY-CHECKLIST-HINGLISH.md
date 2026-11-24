# Chandrahasa — Owner test & deploy checklist (Hinglish)

Aapko coding nahi karni. Is order mein simple owner tasks karein. Har step ka screenshot/output save kar sakte hain, lekin API key/secret/bank/PAN values kabhi screenshot mein share mat karein.

## 1. Pehle normal store test

- [ ] Website open ho, mobile par header/menu/product cards load hon.
- [ ] Customer account create/login karein.
- [ ] Cart mein product add, quantity update, remove.
- [ ] Checkout par test/COD order place karein.
- [ ] Admin Orders mein order dikhe; stock exactly ek baar decrement ho.
- [ ] Order track page par account se status dikhe.

## 2. Customer support live chat

- [ ] Customer account se `/support` kholein aur message bhejein.
- [ ] Admin `/admin-marketplace` khol kar Concierge inbox dekhe.
- [ ] Admin reply kare; customer page par reply live appear ho.
- [ ] Browser refresh karke check karein messages database se wapas aayein.
- [ ] WebSocket connection unavailable ho to REST fallback message save kare.

## 3. Seller KYC provider setup

- [ ] Seller account se seller application submit karein.
- [ ] Admin seller application review/approve kare.
- [ ] Seller legal details and provider document reference submit kare.
- [ ] KYC provider ke sandbox/merchant dashboard mein seller onboarding complete karein.
- [ ] Provider callback URL: `https://YOUR-DOMAIN/api/marketplace/kyc/webhook`.
- [ ] Provider se signed test event bhejwayein; admin KYC section mein provider KYC/bank status aur linked account ID verify karein.
- [ ] Same `eventId` dobara bhej kar duplicate event safe/no duplicate change confirm karein.
- [ ] KYC + bank dono provider se verified aur Route linked account ID present hue bina payout hold clear nahi hona chahiye.

## 4. Seller warehouse & independent sub-orders

- [ ] Seller Portal mein warehouse create karein; first warehouse automatically default hota hai.
- [ ] Seller product ke liye warehouse stock quantity set karein.
- [ ] Admin listing approve kare; seller verified and approved ho.
- [ ] Test order mein do different sellers ke products add karein (agar test seller data available ho).
- [ ] Admin Marketplace Operations mein ek parent order ke neeche alag seller sub-orders check karein.
- [ ] Checkout stock reservation, cancellation reservation release aur delivered stock decrement check karein.
- [ ] Return ko received mark karne ke baad stock automatically restock nahi hona chahiye; physical inspection ke baad hi manual inventory update karein.

## 5. Razorpay Route payout test (real bank payout nahi)

- [ ] Razorpay se Route/Linked Accounts product approval confirm karein; normal Payment Gateway activation enough nahi.
- [ ] Test mode linked account + KYC/bank verification + `acc_...` ID provider callback se set karein.
- [ ] Test captured payment + delivered seller sub-order banayein.
- [ ] Pehle `AUTO_ROUTE_PAYOUTS=false` rakhein; Admin page se manual test release karein.
- [ ] Razorpay dashboard par transfer ID/status verify karein; `transfer.processed` webhook app tak aaye.
- [ ] Duplicate release click/parallel click se second transfer create nahi hona chahiye.
- [ ] Unknown transfer result aaye to Razorpay dashboard reconcile karein; same action baar-baar click na karein.
- [ ] Customer refund tab tak blocked rahega jab tak seller Route transfer reverse/reconcile na ho.
- [ ] Sab sandbox tests pass + finance approval ke baad hi `AUTO_ROUTE_PAYOUTS=true` karein. Automatic scheduler default 7-day payout hold ke baad eligible transfer request bhejta hai; sandbox mein `AUTO_ROUTE_PAYOUT_DELAY_HOURS=0` sirf test purpose ke liye use kar sakte hain.

## 6. GST/TCS workspace

- [ ] CA se confirm karwayein: operator GST registration, supplier eligibility, correct rates, place of supply, discount/return treatment, invoice responsibility.
- [ ] CA-confirmed operator GSTIN and rates Admin → GST/TCS workspace mein enter karein.
- [ ] CA written approval ke baad hi checkbox enable karein.
- [ ] Test payment-captured marketplace order se seller-wise ledger row check karein.
- [ ] Full return receive/refund workflow se negative adjustment row check karein.
- [ ] Month-wise CSV export karke CA se reconcile karwayein.
- [ ] CSV ko directly filed return na samjhein; GSTR-8 filing GST portal par authorized person/CA karega.

## 7. Final deploy

- [ ] ZIP extract karein; `.env`, database ya credentials ko ZIP/GitHub mein upload na karein.
- [ ] Windows par `deploy/OWNER-CHECK-WINDOWS.cmd` double-click karein.
- [ ] `deploy/deploy-railway.ps1` right-click → Run with PowerShell; Railway browser login approve karein.
- [ ] Railway deployment logs mein build success and `/api/health` HTTP 200 verify karein.
- [ ] Persistent volume `/data` and `DATA_PATH=/data/chandrahasa.db` retain karein; SQLite ke saath one replica.
- [ ] Pehle test mode hi rakhein. Live keys / live payout automation tabhi jab every relevant sandbox test pass and business approvals complete.

## Important boundaries

App KYC provider event ko verify aur store karta hai, lekin provider account banana, seller documents inspect karna, bank penny-drop, legal seller approval aur provider account activation external provider ke kaam hain. GST/TCS export working reconciliation hai, filed tax return nahi. Razorpay Route transfer request accepted hone ka matlab bank beneficiary ko final credit confirm hona nahi; final transfer webhook/dashboard settlement status check karein.


## Seller marketplace upgrades (24 Nov 2026)
- Railway variable `SELLER_CARRIER_ENCRYPTION_KEY` mein dedicated 32+ character random secret set karo. Isko baad mein rotate karne se pehle existing seller carrier credentials re-encrypt karne honge.
- Seller Portal → Bulk catalogue import: template download karo, CSV fill karo, upload karo. Sab valid rows admin approval tak hidden rahenge.
- Seller Portal → Independent shipping account: har seller apna Shiprocket email/password aur exact pickup location verify/connect kare.
- Seller sub-order par Create shipment → Shiprocket courier ID enter karke Assign AWB → Generate label → Track. Duplicate/unknown provider state ko manually Shiprocket dashboard mein reconcile kiye bina retry mat karo.
- Admin → Marketplace Operations → Seller performance & policy enforcement: pehle warning-only, minimum sample 5, metrics verify; uske baad hi payout hold/listing pause/suspension enable karo.
- Carrier bookings, AWB, labels aur actual buyer delivery ko Shiprocket sandbox/live account par test karna owner/provider step hai; source QA unka substitute nahi.


### Notification automation (optional)
- Agar n8n ya koi private automation webhook use karna hai, Railway Variables mein `NOTIFICATION_WEBHOOK_URL` (HTTPS) aur `NOTIFICATION_WEBHOOK_SECRET` (32+ random characters) set karo.
- Operations Control Room mein Notification event delivery panel se queue status check karo. Yeh built-in email/SMS/WhatsApp service nahi hai.
