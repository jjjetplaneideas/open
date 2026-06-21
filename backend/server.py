from fastapi import FastAPI, APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
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

from emergentintegrations.llm.chat import LlmChat, UserMessage


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
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


# ============== FISHING SCORE ALGORITHM ==============

def compute_pressure_trend(pressures: List[float]) -> Dict[str, Any]:
    """Compute pressure trend from last few hourly readings."""
    if not pressures or len(pressures) < 3:
        return {"trend": "stable", "delta_hpa": 0.0, "label": "Stable"}
    # Compare last 3 hours vs prior 3 hours
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
    pressure_hpa: float,
    pressure_trend: str,
    wind_kmh: float,
    temp_c: float,
    cloud_pct: float,
    precip_mm: float,
    is_daytime: bool,
) -> Dict[str, Any]:
    """Return a fishing score 0-100 with verdict + factor breakdown."""
    factors = {}

    # Pressure level (29.7-30.1 inHg ~ 1006-1019 hPa is best)
    if 1008 <= pressure_hpa <= 1020:
        p_score = 90
        p_note = "Ideal pressure window"
    elif 1003 <= pressure_hpa < 1008 or 1020 < pressure_hpa <= 1025:
        p_score = 70
        p_note = "Acceptable pressure"
    else:
        p_score = 45
        p_note = "Pressure outside ideal range"
    factors["pressure"] = {"score": p_score, "note": p_note}

    # Pressure TREND is the biggest single factor for fish behavior.
    # Falling pressure (storm approaching) = feeding frenzy. Stable = good. Rising rapidly = poor.
    if pressure_trend == "falling":
        t_score = 95
        t_note = "Falling pressure — fish feeding actively"
    elif pressure_trend == "stable":
        t_score = 75
        t_note = "Stable pressure — steady bite"
    else:
        t_score = 50
        t_note = "Rising pressure — fish less active"
    factors["pressure_trend"] = {"score": t_score, "note": t_note}

    # Wind (light chop is great; calm or heavy is poor)
    if 5 <= wind_kmh <= 20:
        w_score = 90
        w_note = "Light chop — perfect"
    elif wind_kmh < 5:
        w_score = 65
        w_note = "Too calm"
    elif wind_kmh <= 30:
        w_score = 60
        w_note = "Breezy — be cautious"
    else:
        w_score = 30
        w_note = "Strong winds — unsafe"
    factors["wind"] = {"score": w_score, "note": w_note}

    # Cloud cover (overcast is favored for many species)
    if 40 <= cloud_pct <= 80:
        c_score = 85
        c_note = "Overcast — fish less spooked"
    elif cloud_pct < 40:
        c_score = 65
        c_note = "Clear skies"
    else:
        c_score = 75
        c_note = "Heavy clouds"
    factors["clouds"] = {"score": c_score, "note": c_note}

    # Temperature (broad sweet spot)
    if 15 <= temp_c <= 25:
        temp_score = 85
        temp_note = "Comfortable water temps"
    elif 8 <= temp_c < 15 or 25 < temp_c <= 30:
        temp_score = 70
        temp_note = "Acceptable temperature"
    else:
        temp_score = 50
        temp_note = "Extreme temperature"
    factors["temperature"] = {"score": temp_score, "note": temp_note}

    # Precipitation
    if precip_mm == 0:
        precip_score = 80
        precip_note = "Dry conditions"
    elif precip_mm <= 2.5:
        precip_score = 75
        precip_note = "Light rain — often great"
    elif precip_mm <= 7.5:
        precip_score = 55
        precip_note = "Steady rain"
    else:
        precip_score = 35
        precip_note = "Heavy downpour"
    factors["precipitation"] = {"score": precip_score, "note": precip_note}

    # Weighted total
    weights = {
        "pressure_trend": 0.30,
        "pressure": 0.18,
        "wind": 0.18,
        "clouds": 0.12,
        "temperature": 0.12,
        "precipitation": 0.10,
    }
    total = sum(factors[k]["score"] * w for k, w in weights.items())
    total = round(total)

    if total >= 80:
        verdict = "Excellent"
        verdict_blurb = "Drop everything and grab your rod."
    elif total >= 65:
        verdict = "Good"
        verdict_blurb = "Solid conditions — worth a trip."
    elif total >= 50:
        verdict = "Fair"
        verdict_blurb = "Mixed bag — pick your spots carefully."
    else:
        verdict = "Poor"
        verdict_blurb = "Better to tie flies indoors."

    return {
        "score": total,
        "verdict": verdict,
        "blurb": verdict_blurb,
        "factors": factors,
    }


def compute_solunar(sunrise_iso: str, sunset_iso: str) -> Dict[str, Any]:
    """Approximate solunar major/minor periods from sunrise/sunset."""
    try:
        sr = datetime.fromisoformat(sunrise_iso)
        ss = datetime.fromisoformat(sunset_iso)
    except Exception:
        return {"major": [], "minor": []}

    # Simple solunar: majors = around sunrise+sunset (~2hr windows)
    # minors = midday and midnight (~1hr windows)
    major1_start = sr - timedelta(minutes=45)
    major1_end = sr + timedelta(minutes=75)
    major2_start = ss - timedelta(minutes=75)
    major2_end = ss + timedelta(minutes=45)
    midday = sr + (ss - sr) / 2
    minor1_start = midday - timedelta(minutes=30)
    minor1_end = midday + timedelta(minutes=30)

    fmt = lambda d: d.strftime("%H:%M")
    return {
        "major": [
            {"start": fmt(major1_start), "end": fmt(major1_end), "label": "Dawn"},
            {"start": fmt(major2_start), "end": fmt(major2_end), "label": "Dusk"},
        ],
        "minor": [
            {"start": fmt(minor1_start), "end": fmt(minor1_end), "label": "Midday"},
        ],
    }


# ============== OPEN-METEO ==============

OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"
GEOCODE_BASE = "https://geocoding-api.open-meteo.com/v1/search"
REVERSE_BASE = "https://geocoding-api.open-meteo.com/v1/reverse"


async def fetch_open_meteo(lat: float, lon: float) -> Dict[str, Any]:
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,precipitation,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,is_day,weather_code",
        "hourly": "surface_pressure,temperature_2m,wind_speed_10m,cloud_cover,precipitation",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,wind_speed_10m_max,surface_pressure_mean,uv_index_max",
        "timezone": "auto",
        "forecast_days": 7,
        "past_hours": 24,
        "wind_speed_unit": "kmh",
    }
    async with httpx.AsyncClient(timeout=15.0) as hc:
        r = await hc.get(OPEN_METEO_BASE, params=params)
        r.raise_for_status()
        return r.json()


def weather_code_to_text(code: int) -> str:
    mapping = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Foggy",
        48: "Rime fog",
        51: "Light drizzle",
        53: "Drizzle",
        55: "Heavy drizzle",
        61: "Light rain",
        63: "Rain",
        65: "Heavy rain",
        71: "Light snow",
        73: "Snow",
        75: "Heavy snow",
        80: "Rain showers",
        81: "Heavy showers",
        82: "Violent showers",
        95: "Thunderstorm",
        96: "Thunderstorm w/ hail",
        99: "Severe thunderstorm",
    }
    return mapping.get(code, "Unknown")


# ============== ENDPOINTS ==============

@api_router.get("/")
async def root():
    return {"message": "FishCast API"}


@api_router.get("/geocode")
async def geocode(query: str = Query(..., min_length=2)):
    """Forward geocode a city/zip to coordinates."""
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
    """Reverse geocode coordinates to a place name. Open-Meteo's reverse may not
    always return; fall back to a coordinates label."""
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
    """Aggregated forecast + fishing score for given lat/lon."""
    try:
        data = await fetch_open_meteo(lat, lon)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Open-Meteo error: {e}")

    current = data.get("current") or {}
    hourly = data.get("hourly") or {}
    daily = data.get("daily") or {}

    # Pressure history (past hours included via past_hours=24)
    pressures_all: List[float] = [p for p in (hourly.get("surface_pressure") or []) if isinstance(p, (int, float))]
    # Take latest 6 hours of data for trend
    trend_info = compute_pressure_trend(pressures_all[-6:] if len(pressures_all) >= 6 else pressures_all)

    # Today's score
    today_score = compute_fishing_score(
        pressure_hpa=current.get("surface_pressure") or 1013.0,
        pressure_trend=trend_info["trend"],
        wind_kmh=current.get("wind_speed_10m") or 0.0,
        temp_c=current.get("temperature_2m") or 15.0,
        cloud_pct=current.get("cloud_cover") or 0.0,
        precip_mm=current.get("precipitation") or 0.0,
        is_daytime=bool(current.get("is_day", 1)),
    )

    sunrise_today = (daily.get("sunrise") or [None])[0]
    sunset_today = (daily.get("sunset") or [None])[0]
    solunar = compute_solunar(sunrise_today, sunset_today) if sunrise_today and sunset_today else {"major": [], "minor": []}

    # 7-day breakdown
    days = []
    daily_times = daily.get("time") or []
    for i, day in enumerate(daily_times):
        d_pressure = (daily.get("surface_pressure_mean") or [1013.0]*7)[i] if i < len(daily.get("surface_pressure_mean") or []) else 1013.0
        d_wind = (daily.get("wind_speed_10m_max") or [0.0]*7)[i] if i < len(daily.get("wind_speed_10m_max") or []) else 0.0
        d_tmax = (daily.get("temperature_2m_max") or [15.0]*7)[i] if i < len(daily.get("temperature_2m_max") or []) else 15.0
        d_tmin = (daily.get("temperature_2m_min") or [10.0]*7)[i] if i < len(daily.get("temperature_2m_min") or []) else 10.0
        d_precip = (daily.get("precipitation_sum") or [0.0]*7)[i] if i < len(daily.get("precipitation_sum") or []) else 0.0
        d_code = (daily.get("weather_code") or [0]*7)[i] if i < len(daily.get("weather_code") or []) else 0
        d_sunrise = (daily.get("sunrise") or [None]*7)[i] if i < len(daily.get("sunrise") or []) else None
        d_sunset = (daily.get("sunset") or [None]*7)[i] if i < len(daily.get("sunset") or []) else None

        d_trend = "stable" if i == 0 else ("falling" if d_precip > 3 else "stable")
        d_score = compute_fishing_score(
            pressure_hpa=d_pressure,
            pressure_trend=trend_info["trend"] if i == 0 else d_trend,
            wind_kmh=d_wind,
            temp_c=(d_tmax + d_tmin) / 2,
            cloud_pct=60.0 if d_precip > 0 else 30.0,
            precip_mm=d_precip,
            is_daytime=True,
        )
        days.append({
            "date": day,
            "tmax_c": d_tmax,
            "tmin_c": d_tmin,
            "precip_mm": d_precip,
            "wind_max_kmh": d_wind,
            "pressure_hpa": d_pressure,
            "weather_code": d_code,
            "weather_text": weather_code_to_text(d_code),
            "sunrise": d_sunrise,
            "sunset": d_sunset,
            "score": d_score["score"],
            "verdict": d_score["verdict"],
        })

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
        "pressure_trend": trend_info,
        "pressure_history": pressures_all[-24:],
        "sunrise": sunrise_today,
        "sunset": sunset_today,
        "solunar": solunar,
        "today_score": today_score,
        "days": days,
    }


# ============== AI ENDPOINTS ==============

class AIRequest(BaseModel):
    lat: float
    lon: float
    location_name: Optional[str] = ""
    season: Optional[str] = ""  # auto-derived if empty


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
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-6")
    res = await chat.send_message(UserMessage(text=prompt))
    if isinstance(res, str):
        return res
    return str(res)


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

    # Try to parse JSON robustly
    import json, re
    cleaned = text.strip()
    # remove fences if present
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    # find first [ ... ] block
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


@api_router.post("/ai/almanac")
async def ai_almanac(req: AlmanacRequest):
    season = req.season or _derive_season(req.lat)
    where = req.location_name or f"{req.lat:.2f}, {req.lon:.2f}"
    prompt = (
        f"You are writing a short 'local angler almanac' tip for today in {where} ({season}). "
        f"Current conditions: fishing score {req.score or 'N/A'}/100, verdict {req.verdict or 'N/A'}, "
        f"pressure trend {req.pressure_trend or 'stable'}, wind {req.wind_kmh or 'N/A'} km/h, "
        f"temp {req.temp_c or 'N/A'}°C, weather {req.weather or 'N/A'}. "
        f"Write 2 short paragraphs (max 90 words total): "
        f"1) a folklore/almanac-style observation tied to the conditions, "
        f"2) a concrete tactical tip (lure, depth, time window). "
        f"Plain prose, no headings, no markdown."
    )
    system = "You are a veteran fishing guide with deep almanac knowledge. Be concise and useful."
    try:
        text = await _llm_text(prompt, system, session_id=f"almanac-{req.lat:.2f}-{req.lon:.2f}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    return {"almanac": text.strip()}


# ============== SPOTS CRUD ==============

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


# ============== CATCH JOURNAL CRUD ==============

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


# Mount router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
