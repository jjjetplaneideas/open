"""Backend API tests for Anglerj app (iteration 2 - new shape)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/') if os.environ.get('EXPO_PUBLIC_BACKEND_URL') else 'https://catch-conditions-app.preview.emergentagent.com'
API = f"{BASE_URL}/api"
USER_ID = f"TEST_user_{int(time.time())}"

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})


# ---------- Health / root ----------
def test_root():
    r = session.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert "message" in r.json()


# ---------- Geocode ----------
def test_geocode_returns_results():
    r = session.get(f"{API}/geocode", params={"query": "Austin"}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "results" in data and isinstance(data["results"], list)
    assert len(data["results"]) > 0
    first = data["results"][0]
    for k in ("lat", "lon", "display"):
        assert k in first


def test_reverse_geocode():
    r = session.get(f"{API}/reverse-geocode", params={"lat": 44.9778, "lon": -93.2650}, timeout=15)
    assert r.status_code == 200
    assert "display" in r.json()


# ---------- Forecast: Coastal (San Francisco) ----------
def test_forecast_coastal_full_shape():
    """Coastal SF lat/lon should return full shape with tide + swell + moon + scene."""
    r = session.get(f"{API}/forecast", params={"lat": 37.7, "lon": -122.5}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()

    # today_score with new factors
    assert "today_score" in d
    ts = d["today_score"]
    assert isinstance(ts.get("score"), int)
    assert 0 <= ts["score"] <= 100
    assert ts.get("verdict") in ("Excellent", "Good", "Fair", "Poor")
    factors = ts.get("factors") or {}
    assert "solunar" in factors, f"solunar factor missing: {list(factors.keys())}"
    assert "tide" in factors, f"tide factor missing (coastal): {list(factors.keys())}"
    assert "swell" in factors, f"swell factor missing (coastal): {list(factors.keys())}"

    # scene
    assert d.get("scene") in (
        "clear", "partly_cloudy", "overcast", "rain", "heavy_rain",
        "storm", "fog", "night_clear", "night_cloudy",
    )

    # moon
    moon = d.get("moon")
    assert moon and isinstance(moon, dict)
    for k in ("phase_name", "illumination_pct", "age_days", "solunar_score",
              "major_windows", "minor_windows"):
        assert k in moon, f"missing moon.{k}"
    # rise/set/transit may be None at extreme lat, but keys should exist
    for k in ("moonrise", "moonset", "transit", "antitransit"):
        assert k in moon
    assert isinstance(moon["major_windows"], list)
    assert isinstance(moon["minor_windows"], list)

    # tide
    tide = d.get("tide")
    assert tide is not None, "coastal location should return tide"
    for k in ("series", "extrema", "current_height_m", "movement_mph", "direction"):
        assert k in tide, f"missing tide.{k}"
    assert isinstance(tide["series"], list) and len(tide["series"]) > 0

    # swell
    swell = d.get("swell")
    assert swell is not None, "coastal location should return swell"
    for k in ("current_swell_m", "current_period_s", "current_dir_deg",
              "current_wave_m", "series"):
        assert k in swell, f"missing swell.{k}"

    # best_window
    bw = d.get("best_window")
    assert bw and isinstance(bw, dict)
    for k in ("label", "start", "end"):
        assert k in bw

    # pressure trend
    assert d["pressure_trend"]["trend"] in ("rising", "falling", "stable")

    # 7-day
    assert isinstance(d["days"], list) and len(d["days"]) == 7
    for day in d["days"]:
        assert "score" in day and "verdict" in day and "date" in day
        assert "moon_phase" in day
        assert "moon_illumination" in day
        assert "solunar_score" in day

    # sun
    assert d["sunrise"] and d["sunset"]


# ---------- Forecast: Inland (Minneapolis) ----------
def test_forecast_inland_no_marine():
    """Inland Minneapolis should return tide=None, swell=None gracefully."""
    r = session.get(f"{API}/forecast", params={"lat": 44.9778, "lon": -93.2650}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("tide") is None, f"inland tide should be None, got {type(d.get('tide'))}"
    assert d.get("swell") is None, f"inland swell should be None, got {type(d.get('swell'))}"
    # solunar still present
    factors = d["today_score"]["factors"]
    assert "solunar" in factors
    assert "tide" not in factors
    assert "swell" not in factors
    # moon still present
    assert d.get("moon") and "phase_name" in d["moon"]
    # scene present
    assert d.get("scene")


# ---------- AI Recommend ----------
@pytest.mark.timeout(60)
def test_ai_recommend():
    r = session.post(f"{API}/ai/recommend", json={
        "lat": 37.7, "lon": -122.5, "location_name": "San Francisco",
        "score": 75, "verdict": "Good", "pressure_trend": "falling",
        "wind_kmh": 10.0, "temp_c": 16.0, "weather": "Partly cloudy",
        "moon_phase": "Waxing Gibbous", "tide_direction": "incoming",
        "is_coastal": True,
    }, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("target_species", "bait", "depth", "presentation"):
        assert k in d, f"missing {k}"
    # presentation should always have content
    assert isinstance(d["presentation"], str) and len(d["presentation"]) > 5


# ---------- AI Almanac with new optional fields ----------
@pytest.mark.timeout(60)
def test_ai_almanac_with_moon_and_tide():
    r = session.post(f"{API}/ai/almanac", json={
        "lat": 37.7, "lon": -122.5, "location_name": "San Francisco",
        "score": 72, "verdict": "Good", "pressure_trend": "falling",
        "wind_kmh": 10.0, "temp_c": 16.0, "weather": "Partly cloudy",
        "moon_phase": "Waxing Gibbous", "tide_direction": "incoming",
    }, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("almanac"), str) and len(d["almanac"]) > 20


# ---------- AI Species still works ----------
@pytest.mark.timeout(60)
def test_ai_species():
    r = session.post(f"{API}/ai/species", json={
        "lat": 44.9778, "lon": -93.2650, "location_name": "Minneapolis, MN"
    }, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "season" in d
    assert isinstance(d["species"], list) and len(d["species"]) == 6
    required = {"common_name", "scientific_name", "habitat",
                "best_technique", "best_time", "activity_level"}
    for sp in d["species"]:
        missing = required - set(sp.keys())
        assert not missing, f"missing keys {missing} in {sp}"


# ---------- Spots CRUD ----------
def test_spots_crud():
    payload = {"user_id": USER_ID, "name": "TEST_Spot_A",
               "lat": 44.97, "lon": -93.26, "notes": "test"}
    r = session.post(f"{API}/spots", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    spot = r.json()
    assert spot["name"] == payload["name"]
    assert "_id" not in spot
    sid = spot["id"]

    r2 = session.get(f"{API}/spots", params={"user_id": USER_ID}, timeout=15)
    assert r2.status_code == 200
    assert any(s["id"] == sid for s in r2.json())

    r3 = session.delete(f"{API}/spots/{sid}", params={"user_id": USER_ID}, timeout=15)
    assert r3.status_code == 200
    assert r3.json().get("deleted") is True

    r5 = session.delete(f"{API}/spots/{sid}", params={"user_id": USER_ID}, timeout=15)
    assert r5.status_code == 404


# ---------- Catches CRUD ----------
def test_catches_crud():
    payload = {
        "user_id": USER_ID, "species": "TEST_Bass", "weight_lbs": 3.2,
        "length_in": 16.0, "location_name": "TEST Pond",
        "lat": 44.97, "lon": -93.26, "notes": "test catch"
    }
    r = session.post(f"{API}/catches", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    catch = r.json()
    assert catch["species"] == "TEST_Bass"
    assert "_id" not in catch
    cid = catch["id"]

    r2 = session.get(f"{API}/catches", params={"user_id": USER_ID}, timeout=15)
    assert r2.status_code == 200
    assert any(c["id"] == cid for c in r2.json())

    r3 = session.delete(f"{API}/catches/{cid}", params={"user_id": USER_ID}, timeout=15)
    assert r3.status_code == 200

    r4 = session.delete(f"{API}/catches/{cid}", params={"user_id": USER_ID}, timeout=15)
    assert r4.status_code == 404
