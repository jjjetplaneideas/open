"""V1 additions: contributors, safety, confidence, why-here, why-now,
regulations, hotspots, granular reverse-geocode."""
import os
import pytest
import requests

BASE_URL = (os.environ.get('EXPO_PUBLIC_BACKEND_URL')
            or 'https://catch-conditions-app.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})


# ---------- Forecast new fields: contributors, safety, confidence ----------
def test_forecast_contributors_safety_confidence_coastal():
    r = session.get(f"{API}/forecast", params={"lat": 27.7692, "lon": -82.7690},
                    timeout=40)
    assert r.status_code == 200, r.text
    d = r.json()

    # contributors
    ts = d["today_score"]
    contribs = ts.get("contributors")
    assert isinstance(contribs, list) and len(contribs) >= 5
    keys_seen = set()
    has_positive = False
    has_negative = False
    for c in contribs:
        for k in ("key", "label", "delta", "note"):
            assert k in c, f"contributor missing {k}: {c}"
        assert isinstance(c["delta"], int)
        keys_seen.add(c["key"])
        if c["delta"] > 0:
            has_positive = True
        if c["delta"] < 0:
            has_negative = True
    # coastal -> should include tide & solunar in contributors
    assert "tide" in keys_seen
    assert "solunar" in keys_seen
    # Swell should also be present (fixed: swell now has weight & appears in contributors)
    factors_keys = set((ts.get("factors") or {}).keys())
    assert "swell" in factors_keys, "swell factor should be present in factors for coastal"
    assert "swell" in keys_seen, "swell should appear as a contributor for coastal locations"
    swell_contrib = next(c for c in contribs if c["key"] == "swell")
    assert swell_contrib["label"] == "Swell"
    assert isinstance(swell_contrib["delta"], int)
    assert isinstance(swell_contrib["note"], str) and len(swell_contrib["note"]) > 3
    # contributors should be sorted descending by delta
    deltas = [c["delta"] for c in contribs]
    assert deltas == sorted(deltas, reverse=True)

    # safety
    safety = d.get("safety")
    assert safety and isinstance(safety, dict)
    assert safety["level"] in ("Safe", "Use Caution", "Dangerous")
    assert isinstance(safety["reasons"], list) and len(safety["reasons"]) >= 1
    assert isinstance(safety["headline"], str) and len(safety["headline"]) > 5

    # confidence
    conf = d.get("confidence")
    assert conf and isinstance(conf, dict)
    assert conf["label"] in ("High", "Medium", "Low")
    assert isinstance(conf["score"], int)
    assert isinstance(conf["notes"], list) and len(conf["notes"]) >= 1
    assert conf["has_marine"] is True  # coastal


def test_forecast_inland_confidence_has_marine_false():
    r = session.get(f"{API}/forecast", params={"lat": 44.9778, "lon": -93.2650},
                    timeout=40)
    assert r.status_code == 200
    d = r.json()
    assert d["confidence"]["has_marine"] is False
    # safety should still be present
    assert d["safety"]["level"] in ("Safe", "Use Caution", "Dangerous")


# ---------- AI: Why-Here / Why-Now / Regulations ----------
@pytest.mark.timeout(60)
def test_ai_why_here():
    r = session.post(f"{API}/ai/why-here", json={
        "lat": 27.7692, "lon": -82.7690, "location_name": "Treasure Island, FL",
        "score": 72, "verdict": "Good", "pressure_trend": "falling",
        "wind_kmh": 12.0, "temp_c": 24.0, "weather": "Partly cloudy",
        "moon_phase": "Waxing Gibbous", "tide_direction": "incoming",
    }, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("text"), str) and len(d["text"]) > 30


@pytest.mark.timeout(60)
def test_ai_why_now():
    r = session.post(f"{API}/ai/why-now", json={
        "lat": 27.7692, "lon": -82.7690, "location_name": "Treasure Island, FL",
        "score": 72, "verdict": "Good", "pressure_trend": "falling",
        "wind_kmh": 12.0, "temp_c": 24.0, "weather": "Partly cloudy",
        "moon_phase": "Waxing Gibbous", "tide_direction": "incoming",
    }, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("text"), str) and len(d["text"]) > 30


@pytest.mark.timeout(60)
def test_ai_regulations():
    r = session.post(f"{API}/ai/regulations", json={
        "lat": 27.7692, "lon": -82.7690, "location_name": "Treasure Island, FL",
    }, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("summary"), str) and len(d["summary"]) > 50


# ---------- Hotspots ----------
def test_hotspots_coastal():
    r = session.get(f"{API}/hotspots",
                    params={"lat": 27.77, "lon": -82.77}, timeout=40)
    assert r.status_code == 200, r.text
    d = r.json()
    spots = d.get("spots")
    assert isinstance(spots, list)
    assert len(spots) > 5, f"expected coastal hotspots near Treasure Island, got {len(spots)}"
    for s in spots[:5]:
        for k in ("id", "name", "kind", "lat", "lon", "distance_km"):
            assert k in s
    # sorted by distance ascending
    distances = [s["distance_km"] for s in spots]
    assert distances == sorted(distances)


def test_hotspots_inland_returns_array():
    r = session.get(f"{API}/hotspots",
                    params={"lat": 44.9778, "lon": -93.2650}, timeout=40)
    assert r.status_code == 200
    assert isinstance(r.json().get("spots"), list)  # may be empty/small


# ---------- Granular reverse geocode (Nominatim) ----------
def test_reverse_geocode_granular_coastal():
    """Treasure Island area should NOT just return 'Tampa Bay' — should be more specific."""
    r = session.get(f"{API}/reverse-geocode",
                    params={"lat": 27.7692, "lon": -82.7690}, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert "display" in d
    # Display string should include some community-level identifier
    display = (d.get("display") or "").lower()
    name = (d.get("name") or "").lower()
    # Not the broad 'tampa bay'
    assert display != "tampa bay"
    # Some sensible name should be present (Treasure Island, Boca Ciega, St. Pete, etc.)
    assert len(name) > 1 or len(display) > 4
