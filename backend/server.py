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
    sun = ephem.Sun(obs)

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
    swell_height_m: Optional[float] = None,
) -> Dict[str, Any]:
    factors = {}

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

    # Optional tide factor
    weights = {
        "pressure_trend": 0.24, "pressure": 0.14, "wind": 0.14,
        "clouds": 0.10, "temperature": 0.10, "precipitation": 0.08,
        "solunar": 0.20,
    }

    if tide_movement is not None:
        # tide_movement in meters/hour (absolute). 0.2-0.6 m/h ideal for fish
        if 0.15 <= tide_movement <= 0.7:
            tide_score, tide_note = 90, "Strong tide movement — fish on the feed"
        elif tide_movement < 0.05:
            tide_score, tide_note = 45, "Slack tide — slow bite"
        else:
            tide_score, tide_note = 70, "Moderate tide movement"
        factors["tide"] = {"score": tide_score, "note": tide_note}
        # Shift weights when tides are relevant
        weights = {
            "pressure_trend": 0.20, "pressure": 0.12, "wind": 0.12,
            "clouds": 0.08, "temperature": 0.08, "precipitation": 0.06,
            "solunar": 0.16, "tide": 0.18,
        }

    if swell_height_m is not None and swell_height_m > 0:
        if swell_height_m <= 1.2:
            sw_score, sw_note = 85, "Fishable swell"
        elif swell_height_m <= 2.0:
            sw_score, sw_note = 60, "Big swell — pick sheltered spots"
        else:
            sw_score, sw_note = 35, "Dangerous swell — stay onshore"
        factors["swell"] = {"score": sw_score, "note": sw_note}

    total = sum(factors[k]["score"] * w for k, w in weights.items() if k in factors)
    # Normalize because we may not have all keys
    w_sum = sum(w for k, w in weights.items() if k in factors)
    total = round(total / w_sum) if w_sum else 0

    if total >= 80:
        verdict, blurb = "Excellent", "Drop everything and grab your rod."
    elif total >= 65:
        verdict, blurb = "Good", "Solid conditions — worth a trip."
    elif total >= 50:
        verdict, blurb = "Fair", "Mixed bag — pick your spots carefully."
    else:
        verdict, blurb = "Poor", "Better to tie flies indoors."

    return {"score": total, "verdict": verdict, "blurb": blurb, "factors": factors}


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
    return {"message": "FishCast API"}


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
        logging.warning(f"reverse geocode failed: {e}")
    return {"name": None, "display": f"{round(lat,3)}, {round(lon,3)}"}


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
        swell_height_m=(swell["current_swell_m"] if swell else None),
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
            end = datetime.fromisoformat(w["end"])
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
        if month in (12, 1, 2): return "winter"
        if month in (3, 4, 5): return "spring"
        if month in (6, 7, 8): return "summer"
        return "autumn"
    else:
        if month in (12, 1, 2): return "summer"
        if month in (3, 4, 5): return "autumn"
        if month in (6, 7, 8): return "winter"
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
    import json, re
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)
    m = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if m: cleaned = m.group(0)
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
    import json, re
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if m: cleaned = m.group(0)
    try:
        return json.loads(cleaned)
    except Exception:
        return {"target_species": "", "bait": "", "depth": "", "presentation": text.strip()}


# ============== SPOTS ==============

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
