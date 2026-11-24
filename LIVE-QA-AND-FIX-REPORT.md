# Chandrahasa — Live QA findings and source fixes

Date: 2026-11-24
Live frontend audited: https://frontend-chandrahasa.vercel.app

## Confirmed by TinyFish browser audit

- The homepage loads.
- Extensionless routes such as `/shop`, `/heritage`, `/account`, and `/policies` returned the site's 404-style fallback.
- The corresponding static files (`shop.html`, `heritage.html`, `account.html`, `policies.html`, `login.html`, `signup.html`, `admin.html`, `checkout.html`) are present and directly fetchable on the live deployment.
- `/api/health` returned HTTP 404. This is a separate backend/proxy configuration failure; the current source `frontend/vercel.json` still contains `YOUR-RENDER-BACKEND.onrender.com` and must be pointed at the real deployed backend hostname.
- The login page publicly displayed sample customer and admin credentials. Those credentials have been removed from the revised source.
- The homepage and product/heritage pages included 3D/Three.js visual elements. The revised source replaces these with editorial product photography and static process storytelling.

## Source changes in this package

1. Enabled Vercel `cleanUrls` and `trailingSlash: false`, so `/shop` resolves to `shop.html`, `/heritage` to `heritage.html`, `/account` to `account.html`, etc.
2. Added basic browser security response headers.
3. Replaced the homepage 3D canvas with a responsive, photography-led luxury hero.
4. Removed the 3D viewer from product detail and heritage pages; product detail uses product photography.
5. Removed unused Three.js, motion, and heritage animation scripts from the frontend package.
6. Removed publicly displayed demo login credentials.
7. Updated source checks for routing, removed 3D dependencies, and demo-credential exposure.

## Required before the live site can work end-to-end

- Set the actual backend hostname in `frontend/vercel.json` in place of `YOUR-RENDER-BACKEND.onrender.com`.
- Deploy the backend and verify `https://<actual-backend-host>/api/health` returns healthy JSON.
- Redeploy the Vercel frontend with the updated `frontend/` directory as the project root.
- The TinyFish live audit was a read-only desktop browser pass; it did not place orders, sign in, test payment providers, or perform a mobile viewport audit.

## Verification scope

The updated package's local structural and JavaScript syntax checks pass. This does not certify the live Vercel deployment, backend runtime, payment/shipping providers, or production security. The current live `/api/health` 404 means commerce data cannot yet be considered verified.
