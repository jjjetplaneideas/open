# Anglerj — Product Requirements & Progress

## Vision
A complete fishing-decision engine that turns weather, tides, swell, moon/solunar, and barometric pressure into a dynamic "Fishing Score" with AI-generated species recommendations, safety alerts, and daily reports.

## Current Status (June 2026)
Production-track MVP. Dark-mode native iOS/Android app via Expo Router, FastAPI backend, MongoDB.

## Completed
- Core forecasting engine (Open-Meteo, ephem, OSM, Nominatim) with score, safety, confidence
- 24-hour bite forecast, tide & swell charts, animated live conditions
- Catch journal, saved spots, hotspots discovery (OSM Overpass)
- AI: species recommendations, score explanations, almanac, daily report (Emergent LLM)
- Onboarding legal flow (ToS / Privacy / Liability waiver), Regulations Center
- Map picker (Leaflet WebView with native + web fallback)
- Catch analytics dashboard
- Visual brand rebrand to "Anglerj" + dark-mode default + official logo assets (hook-J)
- **Authentication (June 2026 session)**:
  - Email/Password (JWT, bcrypt) — `/api/auth/register`, `/api/auth/login`
  - Apple Sign-In via `expo-apple-authentication` (iOS dev build required)
  - Google Sign-In via Emergent Google Auth proxy
  - Logout, `GET /api/auth/me`, guest-data migration on first sign-in
  - AuthProvider context (loading / authed / unauthed states)
  - Login / Register / Account screens with brand-aligned UI
  - Tokens stored in `expo-secure-store` (mobile) / `localStorage` (web)
  - 23/23 backend auth tests passing (pytest)

## Pending P0
- RevenueCat subscription integration (monthly / yearly / lifetime; entitlement "Anglerj")
  - User-provided key: `test_RRJiTfnoKRFsvaTyVSZVyHXFCnX`
  - Use `react-native-purchases` SDK (Expo native deps; dev build required)
- AdMob free-tier ads (user pub ID: `pub-1411683747413283`, inactive — use Google test IDs for now)
- Relational DB schema migration (Users, Spots, Catches, LegalAcceptances, AnglerjAiCache with UUIDs)

## Pending P1
- Backend modularization (server.py is 1525 lines — split into routes/, services/)
- Secure License Vault (FaceID/TouchID protected document storage)
- Web Admin Dashboard
- Push notifications (bite windows, tide changes)

## Pending P2
- Social profiles, crew sharing, photo fish ID

## Files of Note
- `/app/backend/server.py` — main app + forecast/AI/spots/catches/hotspots endpoints
- `/app/backend/routes/auth.py` — auth endpoints
- `/app/backend/models/user.py` — User pydantic models
- `/app/backend/utils/security.py` — JWT, bcrypt, current-user helper
- `/app/backend/tests/test_auth.py` — 23 auth tests
- `/app/frontend/src/auth.tsx` — AuthProvider context
- `/app/frontend/src/components/AnglerjMark.tsx` & `AnglerjWordmark.tsx` — brand components
- `/app/frontend/assets/images/anglerj_{icon,wordmark,wordmark_tagline,full}.png` — official logo assets
- `/app/frontend/app/{login,register,account}.tsx` — auth screens
