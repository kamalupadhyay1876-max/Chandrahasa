CHANDRAHASA — SPLIT DEPLOYMENT

Frontend: Vercel (frontend folder)
Backend: Render (backend folder; existing Node + SQLite app)

Pehle backend Render par deploy karo. Uska exact URL milne ke baad frontend/vercel.json mein YOUR-RENDER-BACKEND.onrender.com ko replace karo. Phir frontend folder alag Git repo mein push karke Vercel import karo.

Yeh SQLite + Render persistent disk package hai, PostgreSQL conversion nahi. Real payments/order launch se pehle integration, webhook, refund aur concurrency tests run karna zaroori hai. README-DEPLOY.md mein detailed steps hain.

LATEST ADVANCED COMMERCE UPGRADE (24 NOV 2026)
See ADVANCED-COMMERCE-UPGRADE-2026-11-24.md and FINAL-ADVANCED-COMMERCE-DELIVERY-2026-11-24.md for seller operations, KYC/payout gates, semantic/visual discovery, gift-card/loyalty checkout, concierge chat and return fulfilment details. This is an advanced implementation candidate, not Amazon parity or production certification.
