# FishCast – Product Requirements

## Vision
A smart fishing forecast app that tells anglers, at a glance, whether today is a good day to fish — based on barometric pressure trends, weather, sunlight, wind, and AI-curated local almanac knowledge.

## Stack
- **Frontend**: React Native (Expo SDK 54), expo-router, expo-image, expo-image-picker, expo-location, expo-haptics
- **Backend**: FastAPI, MongoDB (motor), httpx
- **Data sources**: Open-Meteo (weather, geocoding) — free, no key
- **AI**: Anthropic Claude Sonnet 4.6 via `emergentintegrations` library + Emergent Universal LLM key
- **Storage**: MongoDB (spots, catches) + AsyncStorage (user_id, saved location)

## Core Features (MVP)
1. **Today** — Hero fishing score (0-100) + verdict (Excellent/Good/Fair/Poor) over a golden-hour water hero. Barometric pressure with rising/falling/stable trend (#1 factor for anglers). Wind, temp, sun/solunar windows, AI "Local Angler Almanac" tip card.
2. **Forecast** — 7-day outlook with daily score badges, tap to expand details.
3. **Fish** — AI-generated seasonal species list for the user's location (6 species with technique, best time, activity level).
4. **Log** — Personal catch journal with photo, weight/length, location, notes.
5. **Spots** — Save/recall favorite fishing pins.
6. **Location** — GPS or manual city/zip lookup via Open-Meteo geocoding.

## Fishing Score Algorithm (weighted)
- Pressure trend 30% (falling = feeding frenzy)
- Pressure level 18%
- Wind 18% (5-20 km/h ideal)
- Cloud cover 12% (overcast favored)
- Temperature 12%
- Precipitation 10%

## Smart Business Hook
**The Local Almanac AI card** (powered by Claude) becomes the daily share-worthy moment — a tactical tip an angler will screenshot and post in fishing groups. Drives organic growth without ad spend.

## Next Iterations
- Push notifications when conditions hit "Excellent" near saved spots
- Hourly bite-window chart
- Premium tier: tide data, water temperature, regulations by state
