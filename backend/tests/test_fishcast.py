"""Backend API tests for FishCast app."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://catch-conditions-app.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
USER_ID = f"TEST_user_{int(time.time())}"

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})


# ---------- Health / root ----------
def test_root():
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert "message" in r.json()


# ---------- Geocode ----------
def test_geocode_returns_results():
    r = session.get(f"{API}/geocode", params={"query": "Austin"})
    assert r.status_code == 200
    data = r.json()
    assert "results" in data and isinstance(data["results"], list)
    assert len(data["results"]) > 0
    first = data["results"][0]
    for k in ("lat", "lon", "display"):
        assert k in first


def test_reverse_geocode():
    r = session.get(f"{API}/reverse-geocode", params={"lat": 44.9778, "lon": -93.2650})
    assert r.status_code == 200
    assert "display" in r.json()


# ---------- Forecast ----------
def test_forecast_structure():
    r = session.get(f"{API}/forecast", params={"lat": 44.9778, "lon": -93.2650})
    assert r.status_code == 200, r.text
    d = r.json()
    # today_score
    assert "today_score" in d
    ts = d["today_score"]
    assert isinstance(ts.get("score"), int)
    assert 0 <= ts["score"] <= 100
    assert ts.get("verdict") in ("Excellent", "Good", "Fair", "Poor")
    # pressure trend
    assert d["pressure_trend"]["trend"] in ("rising", "falling", "stable")
    # 7-day
    assert isinstance(d["days"], list) and len(d["days"]) == 7
    for day in d["days"]:
        assert "score" in day and "verdict" in day and "date" in day
    # sun/solunar
    assert d["sunrise"] and d["sunset"]
    assert "major" in d["solunar"] and "minor" in d["solunar"]


# ---------- AI Species (slow) ----------
@pytest.mark.timeout(60)
def test_ai_species():
    r = session.post(f"{API}/ai/species", json={
        "lat": 44.9778, "lon": -93.2650, "location_name": "Minneapolis, MN"
    }, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "season" in d
    assert isinstance(d["species"], list)
    assert len(d["species"]) == 6, f"expected 6 species, got {len(d['species'])}"
    required = {"common_name", "scientific_name", "habitat", "best_technique", "best_time", "activity_level"}
    for sp in d["species"]:
        missing = required - set(sp.keys())
        assert not missing, f"missing keys {missing} in {sp}"


# ---------- AI Almanac ----------
@pytest.mark.timeout(60)
def test_ai_almanac():
    r = session.post(f"{API}/ai/almanac", json={
        "lat": 44.9778, "lon": -93.2650, "location_name": "Minneapolis",
        "score": 78, "verdict": "Good", "pressure_trend": "falling",
        "wind_kmh": 12.0, "temp_c": 18.0, "weather": "Partly cloudy"
    }, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("almanac"), str) and len(d["almanac"]) > 20


# ---------- Spots CRUD ----------
def test_spots_crud():
    payload = {"user_id": USER_ID, "name": "TEST_Spot_A", "lat": 44.97, "lon": -93.26, "notes": "test"}
    r = session.post(f"{API}/spots", json=payload)
    assert r.status_code == 200, r.text
    spot = r.json()
    assert spot["name"] == payload["name"]
    assert "_id" not in spot
    spot_id = spot["id"]

    # list
    r2 = session.get(f"{API}/spots", params={"user_id": USER_ID})
    assert r2.status_code == 200
    items = r2.json()
    assert any(s["id"] == spot_id for s in items)
    for s in items:
        assert "_id" not in s

    # delete
    r3 = session.delete(f"{API}/spots/{spot_id}", params={"user_id": USER_ID})
    assert r3.status_code == 200
    assert r3.json().get("deleted") is True

    # verify gone
    r4 = session.get(f"{API}/spots", params={"user_id": USER_ID})
    assert not any(s["id"] == spot_id for s in r4.json())

    # 404 on second delete
    r5 = session.delete(f"{API}/spots/{spot_id}", params={"user_id": USER_ID})
    assert r5.status_code == 404


# ---------- Catches CRUD ----------
def test_catches_crud():
    payload = {
        "user_id": USER_ID, "species": "TEST_Bass", "weight_lbs": 3.2,
        "length_in": 16.0, "location_name": "TEST Pond", "lat": 44.97, "lon": -93.26,
        "notes": "test catch"
    }
    r = session.post(f"{API}/catches", json=payload)
    assert r.status_code == 200, r.text
    catch = r.json()
    assert catch["species"] == "TEST_Bass"
    assert "_id" not in catch
    cid = catch["id"]

    r2 = session.get(f"{API}/catches", params={"user_id": USER_ID})
    assert r2.status_code == 200
    items = r2.json()
    assert any(c["id"] == cid for c in items)
    for c in items:
        assert "_id" not in c

    r3 = session.delete(f"{API}/catches/{cid}", params={"user_id": USER_ID})
    assert r3.status_code == 200

    r4 = session.delete(f"{API}/catches/{cid}", params={"user_id": USER_ID})
    assert r4.status_code == 404
