from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import math
import asyncio

import ephem  # type: ignore
from emergentintegrations.llm.chat import LlmChat, UserMessage


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

FishCast = "FishCast"  # legacy name retained in code paths
APP_NAME = "Anglerj"
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ============== MODELS ==============

class Spot(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    lat: float
    lon: float
    notes: Optional[str] = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class SpotCreate(BaseModel):
    user_id: str
    name: str
    lat: float
    lon: float
    notes: Optional[str] = ""

class CatchLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    species: str
    weight_lbs: Optional[float] = None
    length_in: Optional[float] = None
    location_name: Optional[str] = ""
    lat: Optional[float] = None
    lon: Optional[float] = None
    photo_base64: Optional[str] = ""
    notes: Optional[str] = ""
    conditions: Optional[Dict[str, Any]] = None
    caught_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CatchLogCreate(BaseModel):
    user_id: str
    species: str
    weight_lbs: Optional[float] = None
    length_in: Optional[float] = None
    location_name: Optional[str] = ""
    lat: Optional[float] = None
    lon: Optional[float] = None
    photo_base64: Optional[str] = ""
    notes: Optional[str] = ""
    conditions: Optional[Dict[str, Any]] = None


# ============== HELPERS ==============

def weather_code_to_text(code: int) -> str:
    mapping = {
        0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Foggy", 48: "Rime fog",
        51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
        61: "Light rain", 63: "Rain", 65: "Heavy rain",
        71: "Light snow", 73: "Snow", 75: "Heavy snow",
        80: "Rain showers", 81: "Heavy showers", 82: "Violent showers",
        95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Severe thunderstorm",
    }
    return mapping.get(code, "Unknown")


def weather_code_to_scene(code: int, is_day: bool, wind_kmh: float, precip_mm: float) -> str:
    """Map current weather to a discrete scene key for the animated dashboard."""
    if not is_day:
        return "night_clear" if code in (0, 1, 2) else "night_cloudy"
    if code in (95, 96, 99):
        return "storm"
    if code in (45, 48):
        return "fog"
    if code in (61, 63, 65, 80, 81, 82, 51, 53, 55):
        return "heavy_rain" if (precip_mm or 0) > 4 or code in (65, 82) else "rain"
    if code == 3 or (code == 2 and (wind_kmh or 0) > 18):
        return "overcast"
    if code in (1, 2):
        return "partly_cloudy"
    if code == 0:
        return "clear"
    return "partly_cloudy"


# ============== MOON / SOLUNAR (PyEphem) ==============

def _ephem_dt(d: datetime) -> ephem.Date:
    return ephem.Date(d.astimezone(timezone.utc).replace(tzinfo=None))


def compute_moon(lat: float, lon: float, when: Optional[datetime] = None) -> Dict[str, Any]:
    when = when or datetime.now(timezone.utc)
    obs = ephem.Observer()
    obs.lat = str(lat)
    obs.lon = str(lon)
    obs.date = _ephem_dt(when)

    moon = ephem.Moon(obs)
    _sun = ephem.Sun(obs)

    # Phase (illumination % and named phase)
    illum_pct = float(moon.phase)
    # Determine waxing vs waning based on next/prev new moon
    prev_new = ephem.previous_new_moon(obs.date).datetime().replace(tzinfo=timezone.utc)
    next_new = ephem.next_new_moon(obs.date).datetime().replace(tzinfo=timezone.utc)
    cycle_days = (next_new - prev_new).total_seconds() / 86400.0
    age_days = (when - prev_new).total_seconds() / 86400.0
    age_frac = age_days / cycle_days if cycle_days else 0.0
    if age_frac < 0.03 or age_frac > 0.97:
        phase_name = "New Moon"
    elif age_frac < 0.22:
        phase_name = "Waxing Crescent"
    elif age_frac < 0.28:
        phase_name = "First Quarter"
    elif age_frac < 0.47:
        phase_name = "Waxing Gibbous"
    elif age_frac < 0.53:
        phase_name = "Full Moon"
    elif age_frac < 0.72:
        phase_name = "Waning Gibbous"
    elif age_frac < 0.78:
        phase_name = "Last Quarter"
    else:
        phase_name = "Waning Crescent"

    # Rise / set / transit
    def safe(fn):
        try:
            r = fn()
            return r.datetime().replace(tzinfo=timezone.utc).isoformat()
        except (ephem.AlwaysUpError, ephem.NeverUpError, ephem.CircumpolarError):
            return None

    obs.date = _ephem_dt(when)
    moonrise = safe(lambda: obs.next_rising(ephem.Moon()))
    obs.date = _ephem_dt(when)
    moonset = safe(lambda: obs.next_setting(ephem.Moon()))
    obs.date = _ephem_dt(when)
    transit = safe(lambda: obs.next_transit(ephem.Moon()))  # overhead
    obs.date = _ephem_dt(when)
    antitransit = safe(lambda: obs.next_antitransit(ephem.Moon()))  # underfoot

    # Solunar score 0-100 based on moon phase + proximity to solunar windows
    # Near new/full moon = highest activity; near quarters = lowest
    phase_boost = 100.0 * (1.0 - abs(0.5 - (age_frac if age_frac < 0.5 else 1 - age_frac)) * 2)
    # phase_boost: full/new = 100, quarters = 0
    solunar_score = round(max(20.0, min(100.0, phase_boost)))

    # Build major (rise/set) + minor (transit/antitransit) windows
    def window(iso: Optional[str], minutes_before: int, minutes_after: int, label: str):
        if not iso:
            return None
        try:
            t = datetime.fromisoformat(iso)
        except Exception:
            return None
        return {
            "label": label,
            "start": (t - timedelta(minutes=minutes_before)).isoformat(),
            "end": (t + timedelta(minutes=minutes_after)).isoformat(),
        }

    majors = [w for w in [
        window(moonrise, 60, 60, "Moonrise"),
        window(moonset, 60, 60, "Moonset"),
    ] if w]
    minors = [w for w in [
        window(transit, 45, 45, "Moon Overhead"),
        window(antitransit, 45, 45, "Moon Underfoot"),
    ] if w]

    return {
        "phase_name": phase_name,
        "illumination_pct": round(illum_pct, 1),
        "age_days": round(age_days, 1),
        "moonrise": moonrise,
        "moonset": moonset,
        "transit": transit,         # overhead
        "antitransit": antitransit,  # underfoot
        "solunar_score": solunar_score,
        "major_windows": majors,
        "minor_windows": minors,
    }


# ============== FISHING SCORE ==============

def compute_pressure_trend(pressures: List[float]) -> Dict[str, Any]:
    if not pressures or len(pressures) < 3:
        return {"trend": "stable", "delta_hpa": 0.0, "label": "Stable"}
    recent = pressures[-3:]
    prior = pressures[-6:-3] if len(pressures) >= 6 else pressures[:-3]
    if not prior:
        return {"trend": "stable", "delta_hpa": 0.0, "label": "Stable"}
    delta = (sum(recent) / len(recent)) - (sum(prior) / len(prior))
    if delta >= 1.0:
        return {"trend": "rising", "delta_hpa": round(delta, 2), "label": "Rising"}
    if delta <= -1.0:
        return {"trend": "falling", "delta_hpa": round(delta, 2), "label": "Falling"}
    return {"trend": "stable", "delta_hpa": round(delta, 2), "label": "Stable"}


def compute_fishing_score(
    pressure_hpa: float, pressure_trend: str, wind_kmh: float, temp_c: float,
    cloud_pct: float, precip_mm: float, solunar_score: int = 50,
    tide_movement: Optional[float] = None,
    tide_direction: Optional[str] = None,
    swell_height_m: Optional[float] = None,
) -> Dict[str, Any]:
    """Returns a 0-100 fishing score plus a labeled list of positive/negative
    contributors anglers can read at a glance.
    """
    factors: Dict[str, Dict[str, Any]] = {}

    if 1008 <= pressure_hpa <= 1020:
        p_score, p_note = 90, "Ideal pressure window"
    elif 1003 <= pressure_hpa < 1008 or 1020 < pressure_hpa <= 1025:
        p_score, p_note = 70, "Acceptable pressure"
    else:
        p_score, p_note = 45, "Pressure outside ideal range"
    factors["pressure"] = {"score": p_score, "note": p_note}

    if pressure_trend == "falling":
        t_score, t_note = 95, "Falling pressure — fish feeding actively"
    elif pressure_trend == "stable":
        t_score, t_note = 75, "Stable pressure — steady bite"
    else:
        t_score, t_note = 50, "Rising pressure — fish less active"
    factors["pressure_trend"] = {"score": t_score, "note": t_note}

    if 5 <= wind_kmh <= 20:
        w_score, w_note = 90, "Light chop — perfect"
    elif wind_kmh < 5:
        w_score, w_note = 65, "Too calm"
    elif wind_kmh <= 30:
        w_score, w_note = 60, "Breezy — be cautious"
    else:
        w_score, w_note = 30, "Strong winds — unsafe"
    factors["wind"] = {"score": w_score, "note": w_note}

    if 40 <= cloud_pct <= 80:
        c_score, c_note = 85, "Overcast — fish less spooked"
    elif cloud_pct < 40:
        c_score, c_note = 65, "Clear skies"
    else:
        c_score, c_note = 75, "Heavy clouds"
    factors["clouds"] = {"score": c_score, "note": c_note}

    if 15 <= temp_c <= 25:
        temp_score, temp_note = 85, "Comfortable water temps"
    elif 8 <= temp_c < 15 or 25 < temp_c <= 30:
        temp_score, temp_note = 70, "Acceptable temperature"
    else:
        temp_score, temp_note = 50, "Extreme temperature"
    factors["temperature"] = {"score": temp_score, "note": temp_note}

    if precip_mm == 0:
        precip_score, precip_note = 80, "Dry conditions"
    elif precip_mm <= 2.5:
        precip_score, precip_note = 75, "Light rain — often great"
    elif precip_mm <= 7.5:
        precip_score, precip_note = 55, "Steady rain"
    else:
        precip_score, precip_note = 35, "Heavy downpour"
    factors["precipitation"] = {"score": precip_score, "note": precip_note}

    factors["solunar"] = {
        "score": solunar_score,
        "note": (
            "Major moon window soon — peak feeding" if solunar_score >= 80
            else "Solid solunar phase" if solunar_score >= 60
            else "Weak solunar period"
        ),
    }

    weights = {
        "pressure_trend": 0.24, "pressure": 0.14, "wind": 0.14,
        "clouds": 0.10, "temperature": 0.10, "precipitation": 0.08,
        "solunar": 0.20, "swell": 0.0,
    }

    if tide_movement is not None:
        if 0.15 <= tide_movement <= 0.7:
            tide_score, tide_note = 90, f"Strong {tide_direction or ''} tide — fish on the feed".strip()
        elif tide_movement < 0.05:
            tide_score, tide_note = 45, "Slack tide — slow bite"
        else:
            tide_score, tide_note = 70, f"Moderate {tide_direction or ''} tide".strip()
        factors["tide"] = {"score": tide_score, "note": tide_note}
        weights = {
            "pressure_trend": 0.18, "pressure": 0.10, "wind": 0.12,
            "clouds": 0.08, "temperature": 0.08, "precipitation": 0.06,
            "solunar": 0.16, "tide": 0.14, "swell": 0.08,
        }

    if swell_height_m is not None and swell_height_m > 0:
        if swell_height_m <= 1.2:
            sw_score, sw_note = 85, "Fishable swell"
        elif swell_height_m <= 2.0:
            sw_score, sw_note = 60, "Big swell — pick sheltered spots"
        else:
            sw_score, sw_note = 35, "Dangerous swell — stay onshore"
        factors["swell"] = {"score": sw_score, "note": sw_note}
        # Ensure swell weight is non-zero (when not coastal we already set it; here we boost it)
        if "tide" not in factors:
            weights["swell"] = 0.10

    # Normalize total
    used = {k: factors[k]["score"] for k in factors if k in weights}
    w_sum = sum(weights[k] for k in used)
    total = round(sum(used[k] * weights[k] for k in used) / w_sum) if w_sum else 0

    # Build contributor list (signed points relative to baseline 60)
    pretty = {
        "pressure_trend": {
            "rising": "Rising Pressure", "falling": "Falling Pressure",
            "stable": "Stable Pressure",
        },
        "pressure": "Barometric Pressure",
        "wind": "Wind",
        "clouds": "Cloud Cover",
        "temperature": "Temperature",
        "precipitation": "Precipitation",
        "solunar": "Solunar Window",
        "tide": "Tide",
        "swell": "Swell",
    }
    contributors: List[Dict[str, Any]] = []
    baseline = 60.0
    for k in factors:
        if k not in weights:
            continue
        label = (
            pretty["pressure_trend"].get(pressure_trend, "Pressure Trend")
            if k == "pressure_trend"
            else pretty.get(k, k)
        )
        delta = round((factors[k]["score"] - baseline) * weights[k])
        contributors.append({
            "key": k,
            "label": label,
            "delta": delta,
            "note": factors[k]["note"],
        })
    contributors.sort(key=lambda c: c["delta"], reverse=True)

    if total >= 80:
        verdict, blurb = "Excellent", "Drop everything and grab your rod."
    elif total >= 65:
        verdict, blurb = "Good", "Solid conditions — worth a trip."
    elif total >= 50:
        verdict, blurb = "Fair", "Mixed bag — pick your spots carefully."
    else:
        verdict, blurb = "Poor", "Better to tie flies indoors."

    return {
        "score": total,
        "verdict": verdict,
        "blurb": blurb,
        "factors": factors,
        "contributors": contributors,
    }


def compute_safety_status(
    weather_code: int, wind_kmh: float, precip_mm: float,
    swell_height_m: Optional[float], temp_c: float, is_day: bool,
) -> Dict[str, Any]:
    """Compute marine/outdoor safety from weather + wind + swell.
    Returns {"level": Safe/Use Caution/Dangerous, "reasons": [...], "headline": str}
    """
    reasons: List[str] = []
    level = "Safe"

    # Thunderstorms / lightning
    if weather_code in (95, 96, 99):
        level = "Dangerous"
        reasons.append("Thunderstorm activity — lightning risk")
    # Dense fog
    if weather_code in (45, 48):
        if level == "Safe":
            level = "Use Caution"
        reasons.append("Dense fog reduces visibility")
    # Heavy precipitation
    if precip_mm > 7.5:
        if level == "Safe":
            level = "Use Caution"
        reasons.append("Heavy rain — flash flood risk")
    # Wind thresholds (small craft advisory roughly >= 39 km/h sustained)
    if wind_kmh >= 60:
        level = "Dangerous"
        reasons.append(f"Gale-force winds ({round(wind_kmh)} km/h)")
    elif wind_kmh >= 39:
        if level != "Dangerous":
            level = "Use Caution"
        reasons.append(f"Small craft advisory winds ({round(wind_kmh)} km/h)")
    # Swell
    if swell_height_m is not None:
        if swell_height_m >= 2.5:
            level = "Dangerous"
            reasons.append(f"High surf ({swell_height_m:.1f}m swell)")
        elif swell_height_m >= 1.5:
            if level != "Dangerous":
                level = "Use Caution"
            reasons.append(f"Elevated swell ({swell_height_m:.1f}m)")
    # Extreme temperature
    if temp_c >= 38:
        if level != "Dangerous":
            level = "Use Caution"
        reasons.append(f"Extreme heat ({round(temp_c)}°C)")
    if temp_c <= -5:
        if level != "Dangerous":
            level = "Use Caution"
        reasons.append(f"Hypothermia risk ({round(temp_c)}°C)")

    headline = {
        "Safe": "Conditions are safe — fish responsibly.",
        "Use Caution": "Use caution — monitor changing conditions.",
        "Dangerous": "Dangerous conditions — do not attempt offshore travel.",
    }[level]

    if not reasons and level == "Safe":
        reasons = ["No active marine warnings or hazards detected."]

    return {"level": level, "reasons": reasons, "headline": headline}


def compute_confidence(
    has_marine: bool, has_pressure_history: bool, weather_code: int,
) -> Dict[str, Any]:
    """Confidence rating for the forecast. Lowered when key data is missing."""
    score = 100
    notes: List[str] = []
    if not has_pressure_history:
        score -= 15
        notes.append("Limited pressure history")
    if weather_code in (95, 96, 99):
        score -= 15
        notes.append("Rapidly changing storm conditions")
    # Marine missing is fine if location is inland
    label = "High" if score >= 85 else ("Medium" if score >= 65 else "Low")
    if not notes:
        notes = ["All key data sources are fresh."]
    return {"score": score, "label": label, "notes": notes, "has_marine": has_marine}


# ============== OPEN-METEO ==============

OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"
MARINE_BASE = "https://marine-api.open-meteo.com/v1/marine"
GEOCODE_BASE = "https://geocoding-api.open-meteo.com/v1/search"
REVERSE_BASE = "https://geocoding-api.open-meteo.com/v1/reverse"


async def fetch_open_meteo(lat: float, lon: float) -> Dict[str, Any]:
    params = {
        "latitude": lat, "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,precipitation,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,is_day,weather_code",
        "hourly": "surface_pressure,temperature_2m,wind_speed_10m,cloud_cover,precipitation,weather_code",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,wind_speed_10m_max,surface_pressure_mean,uv_index_max",
        "timezone": "auto", "forecast_days": 7, "past_hours": 24,
        "wind_speed_unit": "kmh",
    }
    async with httpx.AsyncClient(timeout=15.0) as hc:
        r = await hc.get(OPEN_METEO_BASE, params=params)
        r.raise_for_status()
        return r.json()


async def fetch_marine(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Fetch tide + swell. Returns None if location isn't coastal/marine data unavailable."""
    params = {
        "latitude": lat, "longitude": lon,
        "hourly": "wave_height,swell_wave_height,swell_wave_period,swell_wave_direction,wind_wave_height,sea_level_height_msl",
        "daily": "wave_height_max,swell_wave_height_max",
        "timezone": "auto", "forecast_days": 3, "past_hours": 24,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as hc:
            r = await hc.get(MARINE_BASE, params=params)
            if r.status_code != 200:
                return None
            data = r.json()
            hourly = data.get("hourly", {})
            # If sea_level_height_msl is all None, no marine data
            sl = hourly.get("sea_level_height_msl") or []
            if not sl or all(v is None for v in sl):
                return None
            return data
    except Exception as e:
        logging.warning(f"marine fetch failed: {e}")
        return None


def extract_tide_data(marine: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not marine:
        return None
    h = marine.get("hourly") or {}
    times: List[str] = h.get("time") or []
    sl: List[Optional[float]] = h.get("sea_level_height_msl") or []
    if not times or not sl:
        return None
    points = []
    for i, t in enumerate(times):
        v = sl[i] if i < len(sl) else None
        if v is None:
            continue
        points.append({"t": t, "h": float(v)})
    if len(points) < 6:
        return None

    # Find tides (local maxima/minima)
    extrema = []
    for i in range(1, len(points) - 1):
        prev_h, cur_h, next_h = points[i-1]["h"], points[i]["h"], points[i+1]["h"]
        if cur_h > prev_h and cur_h > next_h:
            extrema.append({"t": points[i]["t"], "h": cur_h, "kind": "high"})
        elif cur_h < prev_h and cur_h < next_h:
            extrema.append({"t": points[i]["t"], "h": cur_h, "kind": "low"})

    # Current movement (m/h) from last hour
    now_idx = next((i for i, p in enumerate(points)
                    if datetime.fromisoformat(p["t"]) >= datetime.now()), len(points) - 2)
    now_idx = max(1, min(now_idx, len(points) - 1))
    movement = abs(points[now_idx]["h"] - points[now_idx - 1]["h"])  # m / hour
    direction = "incoming" if points[now_idx]["h"] > points[now_idx - 1]["h"] else "outgoing"

    return {
        "series": points[:72],  # next ~3 days
        "extrema": extrema[:12],
        "current_height_m": points[now_idx]["h"],
        "movement_mph": round(movement, 3),
        "direction": direction,
    }


def extract_swell_data(marine: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not marine:
        return None
    h = marine.get("hourly") or {}
    times = h.get("time") or []
    sh = h.get("swell_wave_height") or []
    sp = h.get("swell_wave_period") or []
    sd = h.get("swell_wave_direction") or []
    wh = h.get("wave_height") or []
    if not times or not sh or all(v is None for v in sh):
        return None
    # Current index
    now = datetime.now()
    idx = next((i for i, t in enumerate(times)
                if datetime.fromisoformat(t) >= now), 0)
    points = []
    for i in range(len(times)):
        if i >= len(sh) or sh[i] is None:
            continue
        points.append({
            "t": times[i],
            "swell_h": sh[i],
            "swell_p": sp[i] if i < len(sp) else None,
            "swell_d": sd[i] if i < len(sd) else None,
            "wave_h": wh[i] if i < len(wh) else None,
        })

    cur = points[idx] if idx < len(points) else points[0]
    return {
        "current_swell_m": cur["swell_h"],
        "current_period_s": cur["swell_p"],
        "current_dir_deg": cur["swell_d"],
        "current_wave_m": cur["wave_h"],
        "series": points[:72],
    }


# ============== ENDPOINTS ==============

@api_router.get("/")
async def root():
    return {"message": "Anglerj API", "tagline": "Smarter Decisions. More Bites."}


@api_router.get("/geocode")
async def geocode(query: str = Query(..., min_length=2)):
    async with httpx.AsyncClient(timeout=10.0) as hc:
        r = await hc.get(GEOCODE_BASE, params={"name": query, "count": 5, "language": "en", "format": "json"})
        r.raise_for_status()
        data = r.json()
    results = []
    for item in data.get("results", []) or []:
        results.append({
            "name": item.get("name"),
            "admin1": item.get("admin1"),
            "country": item.get("country"),
            "lat": item.get("latitude"),
            "lon": item.get("longitude"),
            "display": ", ".join(filter(None, [item.get("name"), item.get("admin1"), item.get("country")])),
        })
    return {"results": results}


@api_router.get("/reverse-geocode")
async def reverse_geocode(lat: float, lon: float):
    """Reverse geocode lat/lon to a granular community/neighborhood label.

    Strategy:
      1) Try Nominatim (OpenStreetMap) — returns village/suburb/neighbourhood
         level detail (e.g. "Treasure Island" instead of "Tampa Bay").
      2) Fall back to Open-Meteo geocoding (broader admin labels).
      3) Final fallback: raw coordinates.
    """
    # 1) Nominatim — needs a real User-Agent per their usage policy.
    try:
        async with httpx.AsyncClient(timeout=8.0) as hc:
            r = await hc.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={
                    "lat": lat, "lon": lon, "format": "jsonv2",
                    "zoom": 14, "addressdetails": 1,
                },
                headers={"User-Agent": "FishCast/1.0 (fishing-forecast-app)"},
            )
            if r.status_code == 200:
                data = r.json()
                addr = data.get("address", {}) or {}
                # Prefer the most specific community name available
                community = (
                    addr.get("neighbourhood")
                    or addr.get("hamlet")
                    or addr.get("village")
                    or addr.get("suburb")
                    or addr.get("town")
                    or addr.get("city_district")
                    or addr.get("city")
                    or addr.get("county")
                )
                region = addr.get("state") or addr.get("region") or addr.get("province")
                country = addr.get("country_code", "").upper() if addr.get("country_code") else addr.get("country")
                if community:
                    parts = [community]
                    if region:
                        parts.append(region)
                    if country and country not in (community, region):
                        parts.append(country)
                    return {
                        "name": community,
                        "admin1": region,
                        "country": country,
                        "display": ", ".join(parts),
                    }
    except Exception as e:
        logging.warning(f"nominatim failed: {e}")

    # 2) Open-Meteo fallback
    try:
        async with httpx.AsyncClient(timeout=10.0) as hc:
            r = await hc.get(REVERSE_BASE, params={"latitude": lat, "longitude": lon, "language": "en", "format": "json"})
            if r.status_code == 200:
                data = r.json()
                results = data.get("results") or []
                if results:
                    it = results[0]
                    return {
                        "name": it.get("name"),
                        "admin1": it.get("admin1"),
                        "country": it.get("country"),
                        "display": ", ".join(filter(None, [it.get("name"), it.get("admin1"), it.get("country")])),
                    }
    except Exception as e:
        logging.warning(f"open-meteo reverse failed: {e}")

    # 3) Final fallback
    return {"name": None, "display": f"{round(lat, 3)}, {round(lon, 3)}"}


@api_router.get("/forecast")
async def forecast(lat: float, lon: float):
    try:
        data, marine = await asyncio.gather(
            fetch_open_meteo(lat, lon),
            fetch_marine(lat, lon),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Open-Meteo error: {e}")

    current = data.get("current") or {}
    hourly = data.get("hourly") or {}
    daily = data.get("daily") or {}

    pressures_all: List[float] = [p for p in (hourly.get("surface_pressure") or []) if isinstance(p, (int, float))]
    trend_info = compute_pressure_trend(pressures_all[-6:] if len(pressures_all) >= 6 else pressures_all)

    moon_now = compute_moon(lat, lon)
    tide = extract_tide_data(marine)
    swell = extract_swell_data(marine)

    today_score = compute_fishing_score(
        pressure_hpa=current.get("surface_pressure") or 1013.0,
        pressure_trend=trend_info["trend"],
        wind_kmh=current.get("wind_speed_10m") or 0.0,
        temp_c=current.get("temperature_2m") or 15.0,
        cloud_pct=current.get("cloud_cover") or 0.0,
        precip_mm=current.get("precipitation") or 0.0,
        solunar_score=moon_now["solunar_score"],
        tide_movement=(tide["movement_mph"] if tide else None),
        tide_direction=(tide["direction"] if tide else None),
        swell_height_m=(swell["current_swell_m"] if swell else None),
    )

    # Safety status — overrides fishing score if dangerous
    safety = compute_safety_status(
        weather_code=current.get("weather_code") or 0,
        wind_kmh=current.get("wind_speed_10m") or 0.0,
        precip_mm=current.get("precipitation") or 0.0,
        swell_height_m=(swell["current_swell_m"] if swell else None),
        temp_c=current.get("temperature_2m") or 15.0,
        is_day=bool(current.get("is_day", 1)),
    )

    # Confidence rating based on data freshness/availability
    confidence = compute_confidence(
        has_marine=marine is not None,
        has_pressure_history=len(pressures_all) >= 12,
        weather_code=current.get("weather_code") or 0,
    )

    sunrise_today = (daily.get("sunrise") or [None])[0]
    sunset_today = (daily.get("sunset") or [None])[0]

    # Compute scene key for animated dashboard
    scene = weather_code_to_scene(
        current.get("weather_code") or 0,
        bool(current.get("is_day", 1)),
        current.get("wind_speed_10m") or 0.0,
        current.get("precipitation") or 0.0,
    )

    # 7-day breakdown
    days = []
    daily_times = daily.get("time") or []
    for i, day_iso in enumerate(daily_times):
        d_pressure = (daily.get("surface_pressure_mean") or [1013.0]*7)[i] if i < len(daily.get("surface_pressure_mean") or []) else 1013.0
        d_wind = (daily.get("wind_speed_10m_max") or [0.0]*7)[i] if i < len(daily.get("wind_speed_10m_max") or []) else 0.0
        d_tmax = (daily.get("temperature_2m_max") or [15.0]*7)[i] if i < len(daily.get("temperature_2m_max") or []) else 15.0
        d_tmin = (daily.get("temperature_2m_min") or [10.0]*7)[i] if i < len(daily.get("temperature_2m_min") or []) else 10.0
        d_precip = (daily.get("precipitation_sum") or [0.0]*7)[i] if i < len(daily.get("precipitation_sum") or []) else 0.0
        d_code = (daily.get("weather_code") or [0]*7)[i] if i < len(daily.get("weather_code") or []) else 0
        d_sunrise = (daily.get("sunrise") or [None]*7)[i] if i < len(daily.get("sunrise") or []) else None
        d_sunset = (daily.get("sunset") or [None]*7)[i] if i < len(daily.get("sunset") or []) else None

        try:
            day_dt = datetime.fromisoformat(day_iso + "T12:00:00").replace(tzinfo=timezone.utc)
            d_moon = compute_moon(lat, lon, day_dt)
            d_solunar = d_moon["solunar_score"]
        except Exception:
            d_solunar = 50

        d_trend = "stable" if i == 0 else ("falling" if d_precip > 3 else "stable")
        d_score = compute_fishing_score(
            pressure_hpa=d_pressure,
            pressure_trend=trend_info["trend"] if i == 0 else d_trend,
            wind_kmh=d_wind,
            temp_c=(d_tmax + d_tmin) / 2,
            cloud_pct=60.0 if d_precip > 0 else 30.0,
            precip_mm=d_precip,
            solunar_score=d_solunar,
        )
        days.append({
            "date": day_iso,
            "tmax_c": d_tmax, "tmin_c": d_tmin,
            "precip_mm": d_precip, "wind_max_kmh": d_wind,
            "pressure_hpa": d_pressure,
            "weather_code": d_code, "weather_text": weather_code_to_text(d_code),
            "sunrise": d_sunrise, "sunset": d_sunset,
            "moon_phase": d_moon.get("phase_name") if i < 7 else None,
            "moon_illumination": d_moon.get("illumination_pct") if i < 7 else None,
            "solunar_score": d_solunar,
            "score": d_score["score"], "verdict": d_score["verdict"],
        })

    # Best fishing window today: pick the hour with best conditions
    best_window = compute_best_window(hourly, moon_now, sunrise_today, sunset_today)

    return {
        "location": {"lat": lat, "lon": lon, "timezone": data.get("timezone")},
        "current": {
            "temperature_c": current.get("temperature_2m"),
            "humidity_pct": current.get("relative_humidity_2m"),
            "precip_mm": current.get("precipitation"),
            "cloud_pct": current.get("cloud_cover"),
            "pressure_hpa": current.get("surface_pressure"),
            "wind_kmh": current.get("wind_speed_10m"),
            "wind_dir_deg": current.get("wind_direction_10m"),
            "is_day": bool(current.get("is_day", 1)),
            "weather_code": current.get("weather_code"),
            "weather_text": weather_code_to_text(current.get("weather_code") or 0),
        },
        "scene": scene,
        "pressure_trend": trend_info,
        "pressure_history": pressures_all[-24:],
        "sunrise": sunrise_today,
        "sunset": sunset_today,
        "moon": moon_now,
        "tide": tide,
        "swell": swell,
        "today_score": today_score,
        "safety": safety,
        "confidence": confidence,
        "best_window": best_window,
        "days": days,
    }


def compute_best_window(hourly: Dict[str, Any], moon_now: Dict[str, Any],
                        sunrise: Optional[str], sunset: Optional[str]) -> Optional[Dict[str, Any]]:
    """Find the best 2-3hr window today based on weather + solunar."""
    times = hourly.get("time") or []
    if not times or not sunrise:
        return None
    try:
        sr = datetime.fromisoformat(sunrise)
        ss = datetime.fromisoformat(sunset) if sunset else sr + timedelta(hours=12)
    except Exception:
        return None
    # Default: prefer solunar major (moonrise/moonset/transit) closest to dawn/dusk
    candidates = []
    for w in (moon_now.get("major_windows") or []) + (moon_now.get("minor_windows") or []):
        try:
            start = datetime.fromisoformat(w["start"])
            _end = datetime.fromisoformat(w["end"])
            # Prefer windows during daylight
            if start.date() == sr.date() and sr - timedelta(hours=1) <= start <= ss + timedelta(hours=1):
                candidates.append({"label": w["label"], "start": w["start"], "end": w["end"], "priority": 1 if "rise" in w["label"].lower() or "set" in w["label"].lower() else 2})
        except Exception:
            continue
    if candidates:
        candidates.sort(key=lambda c: c["priority"])
        return candidates[0]
    # Fallback: dawn window
    return {
        "label": "Dawn",
        "start": (sr - timedelta(minutes=30)).isoformat(),
        "end": (sr + timedelta(minutes=90)).isoformat(),
    }


# ============== AI ENDPOINTS ==============

class AIRequest(BaseModel):
    lat: float
    lon: float
    location_name: Optional[str] = ""
    season: Optional[str] = ""


def _derive_season(lat: float) -> str:
    month = datetime.now().month
    northern = lat >= 0
    if northern:
        if month in (12, 1, 2):
            return "winter"
        if month in (3, 4, 5):
            return "spring"
        if month in (6, 7, 8):
            return "summer"
        return "autumn"
    else:
        if month in (12, 1, 2):
            return "summer"
        if month in (3, 4, 5):
            return "autumn"
        if month in (6, 7, 8):
            return "winter"
        return "spring"


async def _llm_text(prompt: str, system: str, session_id: str) -> str:
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-6")
    res = await chat.send_message(UserMessage(text=prompt))
    return res if isinstance(res, str) else str(res)


@api_router.post("/ai/species")
async def ai_species(req: AIRequest):
    season = req.season or _derive_season(req.lat)
    where = req.location_name or f"latitude {req.lat:.2f}, longitude {req.lon:.2f}"
    prompt = (
        f"List 6 fish species an angler is most likely to catch in {where} during {season}. "
        f"For each, give: common_name, scientific_name (short), habitat (one short phrase), "
        f"best_technique (one sentence), best_time (Dawn/Dusk/Midday/Night/Anytime), "
        f"activity_level (Hot/Warm/Cool/Cold based on current season). "
        f"Return STRICT JSON only — an array of 6 objects with exactly those keys. "
        f"No prose, no markdown fences."
    )
    system = "You are a fisheries biologist. Output strict JSON arrays only when asked. No commentary."
    try:
        text = await _llm_text(prompt, system, session_id=f"species-{req.lat:.2f}-{req.lon:.2f}-{season}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    import json
    import re
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)
    m = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if m:
        cleaned = m.group(0)
    try:
        species = json.loads(cleaned)
    except Exception:
        species = []
    return {"season": season, "location": where, "species": species}


class AlmanacRequest(AIRequest):
    score: Optional[int] = None
    verdict: Optional[str] = ""
    pressure_trend: Optional[str] = ""
    wind_kmh: Optional[float] = None
    temp_c: Optional[float] = None
    weather: Optional[str] = ""
    moon_phase: Optional[str] = ""
    tide_direction: Optional[str] = ""


@api_router.post("/ai/almanac")
async def ai_almanac(req: AlmanacRequest):
    season = req.season or _derive_season(req.lat)
    where = req.location_name or f"{req.lat:.2f}, {req.lon:.2f}"
    prompt = (
        f"You are writing a short 'local angler almanac' tip for today in {where} ({season}). "
        f"Conditions: score {req.score or 'N/A'}/100, verdict {req.verdict or 'N/A'}, "
        f"pressure trend {req.pressure_trend or 'stable'}, wind {req.wind_kmh or 'N/A'} km/h, "
        f"temp {req.temp_c or 'N/A'}°C, weather {req.weather or 'N/A'}, "
        f"moon {req.moon_phase or 'N/A'}, tide {req.tide_direction or 'N/A'}. "
        f"Write 2 short paragraphs (max 90 words total): "
        f"1) an almanac-style observation tied to the conditions and moon, "
        f"2) a concrete tactical tip (lure, depth, time window). "
        f"Plain prose, no headings, no markdown."
    )
    system = "You are a veteran fishing guide with deep almanac knowledge. Be concise and useful."
    try:
        text = await _llm_text(prompt, system, session_id=f"almanac-{req.lat:.2f}-{req.lon:.2f}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    return {"almanac": text.strip()}


class RecommendRequest(AlmanacRequest):
    is_coastal: Optional[bool] = False


@api_router.post("/ai/recommend")
async def ai_recommend(req: RecommendRequest):
    """Returns suggested target species + bait/lure for current conditions."""
    season = req.season or _derive_season(req.lat)
    where = req.location_name or f"{req.lat:.2f}, {req.lon:.2f}"
    water = "saltwater/coastal" if req.is_coastal else "freshwater (lake/river)"
    prompt = (
        f"For an angler at {where} ({season}, {water}), current conditions: "
        f"score {req.score}/100, {req.verdict}, pressure {req.pressure_trend}, "
        f"wind {req.wind_kmh} km/h, temp {req.temp_c}°C, weather {req.weather}, "
        f"moon {req.moon_phase}, tide {req.tide_direction}. "
        f"Return STRICT JSON with keys: target_species (string, single best species), "
        f"bait (string, top 1-2 baits/lures with sizes/colors), "
        f"depth (string, e.g. '4-8 ft'), "
        f"presentation (string, one-sentence retrieve/rig tip). "
        f"No prose outside JSON, no markdown fences."
    )
    system = "You are a tournament-level fishing guide. JSON only when asked."
    try:
        text = await _llm_text(prompt, system, session_id=f"rec-{req.lat:.2f}-{req.lon:.2f}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    import json
    import re
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if m:
        cleaned = m.group(0)
    try:
        return json.loads(cleaned)
    except Exception:
        return {"target_species": "", "bait": "", "depth": "", "presentation": text.strip()}


@api_router.post("/ai/why-here")
async def ai_why_here(req: AlmanacRequest):
    where = req.location_name or f"{req.lat:.2f}, {req.lon:.2f}"
    prompt = (
        f"In 2-3 sentences (max 60 words), explain WHY this specific location "
        f"is or isn't favorable for fishing right now: {where}. "
        f"Conditions: wind {req.wind_kmh} km/h, temp {req.temp_c}°C, "
        f"weather {req.weather}, pressure trend {req.pressure_trend}, "
        f"tide {req.tide_direction or 'N/A'}. "
        f"Focus on geography (proximity to structure, current breaks, bait migration, "
        f"shoreline orientation vs wind). Plain prose, no markdown."
    )
    system = "You are a veteran local fishing guide explaining a location's merits."
    try:
        text = await _llm_text(prompt, system, session_id=f"why-here-{req.lat:.2f}-{req.lon:.2f}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    return {"text": text.strip()}


@api_router.post("/ai/why-now")
async def ai_why_now(req: AlmanacRequest):
    prompt = (
        f"In 2-3 sentences (max 60 words), explain WHY the current time window "
        f"is or isn't favorable for fishing. "
        f"Conditions: score {req.score}/100, pressure trend {req.pressure_trend}, "
        f"wind {req.wind_kmh} km/h, temp {req.temp_c}°C, weather {req.weather}, "
        f"moon {req.moon_phase}, tide {req.tide_direction or 'N/A'}. "
        f"Focus on the timing — solunar overlap, tide stage, sunrise/sunset proximity, "
        f"pressure trend. Plain prose, no markdown."
    )
    system = "You are a veteran fishing guide explaining timing."
    try:
        text = await _llm_text(prompt, system, session_id=f"why-now-{req.lat:.2f}-{req.lon:.2f}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    return {"text": text.strip()}


@api_router.post("/ai/regulations")
async def ai_regulations(req: AIRequest):
    where = req.location_name or f"{req.lat:.2f}, {req.lon:.2f}"
    prompt = (
        f"Provide a concise summary of the most common recreational fishing regulations "
        f"for an angler at {where} (approx lat {req.lat:.2f}, lon {req.lon:.2f}). "
        f"Cover: 1) state/agency name and license requirement, 2) 3-5 commonly targeted "
        f"species with bag/size/slot limits when known, 3) any well-known seasonal closures, "
        f"4) typical gear restrictions. Use short bulleted lines (use '- '). "
        f"Begin with one sentence identifying the governing agency. "
        f"At the end, include the line: 'Sources: official state and federal agencies.' "
        f"No markdown headings."
    )
    system = "You summarize recreational fishing regulations concisely. Be accurate."
    try:
        text = await _llm_text(prompt, system, session_id=f"regs-{req.lat:.2f}-{req.lon:.2f}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    return {"summary": text.strip()}


@api_router.get("/hotspots")
async def hotspots(lat: float, lon: float, radius_km: float = 8.0):
    """Find nearby fishing hotspots via OpenStreetMap Overpass API:
    piers, jetties, marinas, fishing spots, beach access, boat ramps, bridges over water.
    """
    radius_m = int(radius_km * 1000)
    query = f"""
    [out:json][timeout:25];
    (
      node["leisure"="fishing"](around:{radius_m},{lat},{lon});
      node["man_made"="pier"](around:{radius_m},{lat},{lon});
      way["man_made"="pier"](around:{radius_m},{lat},{lon});
      node["man_made"="breakwater"](around:{radius_m},{lat},{lon});
      way["man_made"="breakwater"](around:{radius_m},{lat},{lon});
      node["leisure"="slipway"](around:{radius_m},{lat},{lon});
      way["leisure"="slipway"](around:{radius_m},{lat},{lon});
      node["leisure"="marina"](around:{radius_m},{lat},{lon});
      way["leisure"="marina"](around:{radius_m},{lat},{lon});
      node["natural"="beach"](around:{radius_m},{lat},{lon});
    );
    out center 50;
    """
    try:
        async with httpx.AsyncClient(timeout=20.0) as hc:
            r = await hc.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": query},
                headers={"User-Agent": "FishCast/1.0"},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logging.warning(f"overpass failed: {e}")
        return {"spots": []}

    spots = []
    for el in data.get("elements", [])[:30]:
        slat = el.get("lat") or (el.get("center") or {}).get("lat")
        slon = el.get("lon") or (el.get("center") or {}).get("lon")
        if slat is None or slon is None:
            continue
        tags = el.get("tags", {}) or {}
        name = tags.get("name") or _spot_kind(tags).title()
        # Approximate distance (haversine)
        d = _haversine_km(lat, lon, slat, slon)
        spots.append({
            "id": str(el.get("id")),
            "name": name,
            "kind": _spot_kind(tags),
            "lat": slat,
            "lon": slon,
            "distance_km": round(d, 2),
        })
    spots.sort(key=lambda s: s["distance_km"])
    return {"spots": spots[:25]}


def _spot_kind(tags: Dict[str, Any]) -> str:
    if tags.get("leisure") == "fishing":
        return "fishing spot"
    if tags.get("man_made") == "pier":
        return "pier"
    if tags.get("man_made") == "breakwater":
        return "jetty"
    if tags.get("leisure") == "slipway":
        return "boat ramp"
    if tags.get("leisure") == "marina":
        return "marina"
    if tags.get("natural") == "beach":
        return "beach"
    return "spot"


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    rl1, rl2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rl1) * math.cos(rl2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


@api_router.get("/forecast/hourly")
async def forecast_hourly(lat: float, lon: float):
    """24-hour bite forecast: per-hour score with solunar overlay."""
    try:
        data, marine = await asyncio.gather(fetch_open_meteo(lat, lon), fetch_marine(lat, lon))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Open-Meteo error: {e}")

    hourly = data.get("hourly") or {}
    times: List[str] = hourly.get("time") or []
    pressures: List[Optional[float]] = hourly.get("surface_pressure") or []
    temps: List[Optional[float]] = hourly.get("temperature_2m") or []
    winds: List[Optional[float]] = hourly.get("wind_speed_10m") or []
    clouds: List[Optional[float]] = hourly.get("cloud_cover") or []
    precs: List[Optional[float]] = hourly.get("precipitation") or []
    codes: List[Optional[int]] = hourly.get("weather_code") or []

    # Marine series (tide) if available
    marine_h = (marine or {}).get("hourly") or {}
    marine_times = marine_h.get("time") or []
    marine_sl = marine_h.get("sea_level_height_msl") or []
    marine_swell = marine_h.get("swell_wave_height") or []

    # Build moon windows for next 24h
    now = datetime.now(timezone.utc)
    moon = compute_moon(lat, lon, now)

    # Determine "now" index in hourly
    def parse_iso(t: str) -> datetime:
        try:
            return datetime.fromisoformat(t)
        except Exception:
            return now

    if not times:
        return {"hours": [], "moon_windows": []}
    start_idx = 0
    for i, t in enumerate(times):
        if parse_iso(t) >= now.astimezone(parse_iso(times[0]).tzinfo or timezone.utc).replace(tzinfo=parse_iso(times[0]).tzinfo):
            start_idx = max(0, i - 1)
            break

    hours = []
    for i in range(start_idx, min(start_idx + 24, len(times))):
        t = times[i]
        # Tide movement at this hour
        tide_mph = None
        tide_dir = None
        if marine_times and marine_sl and t in marine_times:
            mi = marine_times.index(t)
            if mi > 0 and marine_sl[mi] is not None and marine_sl[mi - 1] is not None:
                tide_mph = abs(marine_sl[mi] - marine_sl[mi - 1])
                tide_dir = "incoming" if marine_sl[mi] > marine_sl[mi - 1] else "outgoing"
        swell_m = None
        if marine_swell and t in marine_times:
            mi = marine_times.index(t)
            if mi < len(marine_swell):
                swell_m = marine_swell[mi]

        # Lightweight pressure trend approximation: compare with i-3
        trend = "stable"
        if i >= 3 and pressures[i] is not None and pressures[i - 3] is not None:
            d = pressures[i] - pressures[i - 3]
            if d >= 1.0:
                trend = "rising"
            elif d <= -1.0:
                trend = "falling"

        # Approximate per-hour solunar score: boost during major/minor windows
        h_dt = parse_iso(t)
        in_major = any(
            datetime.fromisoformat(w["start"]) <= h_dt.replace(tzinfo=datetime.fromisoformat(w["start"]).tzinfo) <= datetime.fromisoformat(w["end"])
            for w in (moon.get("major_windows") or [])
        )
        in_minor = any(
            datetime.fromisoformat(w["start"]) <= h_dt.replace(tzinfo=datetime.fromisoformat(w["start"]).tzinfo) <= datetime.fromisoformat(w["end"])
            for w in (moon.get("minor_windows") or [])
        )
        hourly_solunar = (
            min(100, moon["solunar_score"] + 20) if in_major
            else min(100, moon["solunar_score"] + 10) if in_minor
            else max(20, moon["solunar_score"] - 15)
        )

        score = compute_fishing_score(
            pressure_hpa=pressures[i] or 1013.0,
            pressure_trend=trend,
            wind_kmh=winds[i] or 0.0,
            temp_c=temps[i] or 15.0,
            cloud_pct=clouds[i] or 0.0,
            precip_mm=precs[i] or 0.0,
            solunar_score=hourly_solunar,
            tide_movement=tide_mph,
            tide_direction=tide_dir,
            swell_height_m=swell_m,
        )

        hours.append({
            "time": t,
            "score": score["score"],
            "verdict": score["verdict"],
            "weather_code": codes[i] if i < len(codes) else 0,
            "weather_text": weather_code_to_text(codes[i] if i < len(codes) else 0),
            "in_major": in_major,
            "in_minor": in_minor,
            "temp_c": temps[i],
            "wind_kmh": winds[i],
            "tide_direction": tide_dir,
        })

    return {
        "hours": hours,
        "moon_windows": {
            "major": moon.get("major_windows") or [],
            "minor": moon.get("minor_windows") or [],
        },
    }


class ExplainRequest(BaseModel):
    lat: float
    lon: float
    location_name: Optional[str] = ""
    score: int
    verdict: str
    contributors: List[Dict[str, Any]] = []


@api_router.post("/ai/explain-score")
async def ai_explain_score(req: ExplainRequest):
    pos = [c for c in req.contributors if c.get("delta", 0) > 0]
    neg = [c for c in req.contributors if c.get("delta", 0) < 0]
    pos_str = ", ".join(f"{c['label']} ({c['delta']:+d})" for c in pos[:4]) or "none"
    neg_str = ", ".join(f"{c['label']} ({c['delta']:+d})" for c in neg[:4]) or "none"
    where = req.location_name or f"{req.lat:.2f}, {req.lon:.2f}"
    prompt = (
        f"Explain in 2 sentences (max 50 words) why today's fishing score in {where} is "
        f"{req.score}/100 ({req.verdict}). Top positives: {pos_str}. Top negatives: {neg_str}. "
        f"Use plain beginner-friendly language. No jargon, no markdown, no headings."
    )
    system = "You explain fishing forecasts in friendly plain language. Be concise."
    try:
        text = await _llm_text(prompt, system, session_id=f"explain-{req.lat:.2f}-{req.lon:.2f}-{req.score}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    return {"text": text.strip()}


class SpeciesDetailRequest(BaseModel):
    common_name: str
    location_name: Optional[str] = ""
    lat: Optional[float] = None
    lon: Optional[float] = None


@api_router.post("/ai/species-detail")
async def ai_species_detail(req: SpeciesDetailRequest):
    where = req.location_name or "the user's region"
    prompt = (
        f"Provide a detailed angler profile for {req.common_name} in {where}. "
        f"Return STRICT JSON with these keys: "
        f"scientific_name, identification (1 short sentence), habitat (1 sentence), "
        f"range (1 sentence), seasonal_activity (1 sentence), best_time_of_day, "
        f"best_tide_stage, best_moon_phase, preferred_water_temp_f, preferred_structure, "
        f"typical_depth_ft, baits (array of 3-5 strings), lures (array of 3-5 strings), "
        f"techniques (array of 2-3 short strings), typical_size (string), trophy_size (string), "
        f"regulations_note (one sentence — generic, end with 'verify with local agency'). "
        f"No prose outside JSON. No markdown fences."
    )
    system = "You are a fisheries biologist. Output strict JSON only."
    try:
        text = await _llm_text(prompt, system, session_id=f"species-detail-{req.common_name}-{req.lat or 0:.1f}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    import json
    import re
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if m:
        cleaned = m.group(0)
    try:
        return json.loads(cleaned)
    except Exception:
        return {"scientific_name": "", "identification": text.strip(), "regulations_note": ""}


# ============== USER DATA EXPORT / DELETE ==============

@api_router.get("/user/export")
async def export_user(user_id: str):
    spots = await db.spots.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    catches = await db.catches.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user_id": user_id,
        "spots": spots,
        "catches": catches,
    }


@api_router.delete("/user/data")
async def delete_user_data(user_id: str):
    s = await db.spots.delete_many({"user_id": user_id})
    c = await db.catches.delete_many({"user_id": user_id})
    return {"spots_deleted": s.deleted_count, "catches_deleted": c.deleted_count}


# ============== CATCH ANALYTICS ==============

@api_router.get("/catches/analytics")
async def catch_analytics(user_id: str):
    """Derive personal fishing patterns from the user's logged catches."""
    items = await db.catches.find({"user_id": user_id}, {"_id": 0}).to_list(10000)
    total = len(items)
    if total == 0:
        return {"total": 0, "insights": []}

    # Aggregate by species
    by_species: Dict[str, int] = {}
    by_tide: Dict[str, int] = {}
    by_moon: Dict[str, int] = {}
    by_hour: Dict[int, int] = {}
    pressures: List[float] = []
    by_bait: Dict[str, int] = {}

    for c in items:
        sp = (c.get("species") or "Unknown").strip()
        by_species[sp] = by_species.get(sp, 0) + 1
        conds = c.get("conditions") or {}
        td = conds.get("tide_direction") or ""
        if td:
            by_tide[td] = by_tide.get(td, 0) + 1
        mp = conds.get("moon_phase") or ""
        if mp:
            by_moon[mp] = by_moon.get(mp, 0) + 1
        p = conds.get("pressure_hpa")
        if isinstance(p, (int, float)):
            pressures.append(float(p))
        try:
            t = c.get("caught_at")
            if t:
                h = datetime.fromisoformat(t).hour
                by_hour[h] = by_hour.get(h, 0) + 1
        except Exception:
            pass
        bait = (c.get("notes") or "").strip().lower()
        if bait:
            for token in ["shrimp", "minnow", "pinfish", "plug", "jerkbait", "spinnerbait", "jig", "fly", "swimbait", "soft plastic"]:
                if token in bait:
                    by_bait[token] = by_bait.get(token, 0) + 1

    insights = []
    # Top species
    if by_species:
        top_sp = max(by_species, key=by_species.get)
        pct = round(100 * by_species[top_sp] / total)
        insights.append({
            "title": "Top species",
            "text": f"{top_sp} accounts for {pct}% of your catches ({by_species[top_sp]} of {total}).",
        })
    # Tide
    if by_tide:
        top_t = max(by_tide, key=by_tide.get)
        t_pct = round(100 * by_tide[top_t] / sum(by_tide.values()))
        insights.append({
            "title": "Best tide",
            "text": f"You catch {t_pct}% of your fish on {top_t} tides.",
        })
    # Moon
    if by_moon:
        top_m = max(by_moon, key=by_moon.get)
        insights.append({
            "title": "Best moon phase",
            "text": f"Your most productive moon phase is {top_m}.",
        })
    # Hour
    if by_hour:
        peak_h = max(by_hour, key=by_hour.get)
        period = "morning" if peak_h < 11 else ("afternoon" if peak_h < 17 else "evening")
        insights.append({
            "title": "Best time",
            "text": f"Most of your catches happen around {peak_h:02d}:00 — the {period} bite is your strength.",
        })
    # Pressure window
    if len(pressures) >= 3:
        avg = sum(pressures) / len(pressures)
        insights.append({
            "title": "Pressure sweet spot",
            "text": f"Your catches cluster near {avg:.1f} hPa ({avg * 0.02953:.2f} inHg).",
        })
    # Bait
    if by_bait:
        top_b = max(by_bait, key=by_bait.get)
        insights.append({
            "title": "Top bait",
            "text": f"'{top_b}' shows up most often in your catch notes — your confidence bait.",
        })

    return {
        "total": total,
        "insights": insights,
        "by_species": [{"name": k, "count": v} for k, v in sorted(by_species.items(), key=lambda kv: -kv[1])[:10]],
        "by_tide": by_tide,
        "by_moon": by_moon,
    }


# ============== SPOTS (extended) ==============

@api_router.get("/spots")
async def list_spots(user_id: str):
    items = await db.spots.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api_router.post("/spots", response_model=Spot)
async def create_spot(s: SpotCreate):
    spot = Spot(**s.dict())
    await db.spots.insert_one(spot.dict())
    return spot


@api_router.delete("/spots/{spot_id}")
async def delete_spot(spot_id: str, user_id: str):
    res = await db.spots.delete_one({"id": spot_id, "user_id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Spot not found")
    return {"deleted": True}


# ============== CATCHES ==============

@api_router.get("/catches")
async def list_catches(user_id: str):
    items = await db.catches.find({"user_id": user_id}, {"_id": 0}).sort("caught_at", -1).to_list(1000)
    return items


@api_router.post("/catches", response_model=CatchLog)
async def create_catch(c: CatchLogCreate):
    catch = CatchLog(**c.dict())
    await db.catches.insert_one(catch.dict())
    return catch


@api_router.delete("/catches/{catch_id}")
async def delete_catch(catch_id: str, user_id: str):
    res = await db.catches.delete_one({"id": catch_id, "user_id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Catch not found")
    return {"deleted": True}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware, allow_credentials=True, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
