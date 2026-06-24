# Anglerj — Product Requirements & Progress

## Vision
Complete fishing-decision engine turning weather, tides, swell, moon/solunar, pressure into a dynamic Fishing Score with AnglerjAi recommendations, safety alerts, and daily reports.

## Branding
- App: **Anglerj** (always lowercase "anglerj" in wordmark, hook-J as the icon)
- AI sub-brand: **AnglerjAi** (NEVER `AnglerjAI`) — the intelligence layer inside Anglerj
- Tagline: SMARTER DECISIONS. MORE BITES.
- Tiers: **Free**, **Anglerj Pro** (monthly + yearly), **Anglerj Founder** (lifetime)

## Completed
- Forecasting engine, charts, hotspots, catch journal, AI surfaces, onboarding/legal, regulations center, dark-mode rebrand
- Auth (Email/Password JWT, Google via Emergent, Apple Sign-In) + guest migration
- Brand assets: official `anglerj_icon.png`, `anglerj_wordmark.png`, `anglerj_wordmark_tagline.png`, `anglerj_full.png`
- Design system tokens applied to auth screens (Deep Ocean bg, BrandInput, GradientButton, TaglineBar)
- **RevenueCat (June 2026 session)**:
  - `react-native-purchases` + `react-native-purchases-ui` installed
  - `SubscriptionProvider` with graceful fallback for web / Expo Go
  - 3 entitlements: `pro`, `founder` + 3 products: `monthly`, `yearly`, `lifetime`
  - Anglerj-branded `/paywall` screen with PaywallSheet (kicker, hero, tagline pill, feature list, 3 tier cards, restore button)
  - Restore Purchases (Settings + Paywall) and Customer Center entry points
  - Backend `POST /api/subscriptions/webhook` + `GET /api/subscriptions/me`
  - Subscription status surfaced in Settings → Subscription row
  - `usePremium()` and `useSubscription()` hooks for clean gating
- **Auth flow rework**:
  - Routing: legal? → `/onboarding` ; auth or guest? → `/(tabs)` ; else → `/login`
  - Login mandatory on launch (no token, no guest flag)
  - "Remember me" toggle persists token across cold-starts; unchecked clears token on next boot
  - "Continue as guest (ads-supported)" sets sticky guest flag

## Pending P0
- **AdMob (free-tier banners + interstitials)**
  - User publisher: `pub-1411683747413283` (inactive — use Google test IDs)
  - Free + guest users see ads; Pro/Founder bypass
- Wire **premium gating** into specific AI endpoints (currently only surfaced via UI label; backend allows all)
- Relational DB schema migration (Users, Spots, Catches, LegalAcceptances, AnglerjAiCache UUIDs)

## Pending P1
- System-wide design system propagation (settings, account, onboarding, dashboard cards)
- Hotspots map view (numbered pins + GPS marker)
- Fish directory expansion (all aquatic species + bait)
- "Best Bet" → "Best Play"; almanac under Best Play
- Backend modularization (split 1525-line `server.py`)
- Secure License Vault (FaceID/TouchID)
- Web Admin Dashboard
- Push notifications

## Native build / dashboard setup required for RevenueCat
- iOS App Store Connect: create products `monthly`, `yearly`, `lifetime` linked to the Anglerj bundle
- Google Play Console: create matching subscription/in-app products
- RevenueCat dashboard:
  - Create iOS and Android apps with matching bundle IDs
  - Map products to entitlements: monthly + yearly → `pro`; lifetime → `founder` (additionally grant `pro`)
  - Create Offering with the three packages
  - Configure webhook → `https://<host>/api/subscriptions/webhook` with shared `Authorization` header set in backend `.env` as `REVENUECAT_WEBHOOK_AUTH_SECRET`
  - Set `REVENUECAT_SECRET_API_KEY` (secret REST key) in backend `.env`
- EAS Dev/Production build required: `react-native-purchases` cannot run on Expo Go or web
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` already set with sandbox key `test_RRJiTfnoKRFsvaTyVSZVyHXFCnX` (replace per platform in prod)

## Files of note (this session)
- Backend: `/app/backend/routes/subscriptions.py`
- Frontend: `/app/frontend/src/subscription.tsx`, `/app/frontend/src/components/PaywallSheet.tsx`, `/app/frontend/app/paywall.tsx`, `/app/frontend/app/index.tsx` (routing), `/app/frontend/src/auth.tsx` (rememberMe + guest mode), `/app/frontend/app/login.tsx` (Remember me toggle + guest CTA)
