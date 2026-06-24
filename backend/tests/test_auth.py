"""
Auth & migration backend tests for Anglerj.

Tests cover:
- POST /api/auth/register (success, duplicate, weak pw)
- POST /api/auth/login (valid, wrong pw, non-existent email)
- GET /api/auth/me (valid token, missing/invalid token)
- POST /api/auth/logout
- POST /api/auth/google (invalid session_id)
- POST /api/auth/apple (invalid identity_token)
- POST /api/auth/migrate (requires auth, reassigns guest data)
- End-to-end guest -> authenticated data migration
- Regression on forecast/spots endpoints
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://catch-conditions-app.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


def _unique_email(prefix="testuser"):
    return f"TEST_{prefix}_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}@anglerj.dev"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def registered_user(session):
    """Create a fresh user for the module so other tests can use it."""
    email = _unique_email("primary")
    password = "strongPass1234"
    r = session.post(f"{API}/auth/register", json={
        "email": email, "password": password, "name": "Primary Tester"
    })
    assert r.status_code == 200, f"register setup failed: {r.status_code} {r.text}"
    body = r.json()
    return {"email": email, "password": password, "token": body["access_token"], "user": body["user"]}


# =========================
# REGISTER
# =========================
class TestRegister:
    def test_register_success(self, session):
        email = _unique_email("reg")
        r = session.post(f"{API}/auth/register", json={
            "email": email, "password": "strongPass1234", "name": "Reg User"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data and data["access_token"]
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == email.lower()
        assert data["user"]["auth_provider"] == "email"
        assert data["user"]["user_id"].startswith("u_")
        assert data["migrated"] == {"spots": 0, "catches": 0}

    def test_register_duplicate_email_returns_409(self, session, registered_user):
        r = session.post(f"{API}/auth/register", json={
            "email": registered_user["email"], "password": "strongPass1234", "name": "Dup"
        })
        assert r.status_code == 409, f"expected 409, got {r.status_code} {r.text}"
        assert "already exists" in r.json().get("detail", "").lower()

    def test_register_weak_password_returns_422(self, session):
        r = session.post(f"{API}/auth/register", json={
            "email": _unique_email("weak"), "password": "short", "name": "Weak"
        })
        assert r.status_code == 422, f"expected 422, got {r.status_code} {r.text}"

    def test_register_invalid_email_format_returns_422(self, session):
        r = session.post(f"{API}/auth/register", json={
            "email": "not-an-email", "password": "strongPass1234"
        })
        assert r.status_code == 422


# =========================
# LOGIN
# =========================
class TestLogin:
    def test_login_success(self, session, registered_user):
        r = session.post(f"{API}/auth/login", json={
            "email": registered_user["email"], "password": registered_user["password"]
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data and data["access_token"]
        assert data["user"]["email"] == registered_user["email"].lower()
        assert data["user"]["user_id"] == registered_user["user"]["user_id"]

    def test_login_wrong_password_returns_401(self, session, registered_user):
        r = session.post(f"{API}/auth/login", json={
            "email": registered_user["email"], "password": "wrongPassword999"
        })
        assert r.status_code == 401
        assert r.json().get("detail") == "Invalid email or password"

    def test_login_non_existent_email_returns_401(self, session):
        r = session.post(f"{API}/auth/login", json={
            "email": _unique_email("ghost"), "password": "anyPassword12"
        })
        assert r.status_code == 401
        assert r.json().get("detail") == "Invalid email or password"

    def test_login_email_case_insensitive(self, session, registered_user):
        r = session.post(f"{API}/auth/login", json={
            "email": registered_user["email"].upper(), "password": registered_user["password"]
        })
        assert r.status_code == 200, r.text


# =========================
# /auth/me
# =========================
class TestMe:
    def test_me_with_valid_token(self, session, registered_user):
        r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {registered_user['token']}"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == registered_user["email"].lower()
        assert data["user_id"] == registered_user["user"]["user_id"]
        assert data["auth_provider"] == "email"

    def test_me_missing_token_returns_401(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"

    def test_me_invalid_token_returns_401(self, session):
        r = session.get(f"{API}/auth/me", headers={"Authorization": "Bearer not.a.valid.jwt"})
        assert r.status_code == 401

    def test_me_wrong_scheme_returns_401(self, session, registered_user):
        r = session.get(f"{API}/auth/me", headers={"Authorization": f"Token {registered_user['token']}"})
        assert r.status_code == 401


# =========================
# LOGOUT
# =========================
class TestLogout:
    def test_logout_returns_ok(self, session):
        r = session.post(f"{API}/auth/logout")
        assert r.status_code == 200
        assert r.json() == {"ok": True}


# =========================
# GOOGLE
# =========================
class TestGoogle:
    def test_google_invalid_session_returns_401_or_502(self, session):
        r = session.post(f"{API}/auth/google", json={"session_id": "definitely-invalid-session-id-xyz"})
        assert r.status_code in (401, 502), f"expected 401/502, got {r.status_code} {r.text}"


# =========================
# APPLE
# =========================
class TestApple:
    def test_apple_invalid_identity_token_returns_400(self, session):
        r = session.post(f"{API}/auth/apple", json={
            "identity_token": "not-a-jwt", "apple_user_id": "apple_test_1"
        })
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"


# =========================
# MIGRATE (auth-protected endpoint)
# =========================
class TestMigrateEndpoint:
    def test_migrate_requires_auth(self, session):
        r = session.post(f"{API}/auth/migrate", json={"guest_user_id": "guest_xyz"})
        assert r.status_code == 401

    def test_migrate_reassigns_spots(self, session):
        # 1) Create a guest user_id and seed a spot
        guest_id = f"guest_{uuid.uuid4().hex[:12]}"
        spot_r = session.post(f"{API}/spots", json={
            "user_id": guest_id, "name": "TEST_Migrate_Spot", "lat": 27.76, "lon": -82.76, "notes": "test"
        })
        assert spot_r.status_code == 200, spot_r.text
        spot_id = spot_r.json()["id"]

        # 2) Register a new user (no guest_user_id at register time)
        email = _unique_email("migrate")
        reg = session.post(f"{API}/auth/register", json={
            "email": email, "password": "strongPass1234", "name": "Migrator"
        }).json()
        token = reg["access_token"]
        new_user_id = reg["user"]["user_id"]

        # 3) Call /auth/migrate
        m = session.post(f"{API}/auth/migrate",
                         json={"guest_user_id": guest_id},
                         headers={"Authorization": f"Bearer {token}"})
        assert m.status_code == 200, m.text
        body = m.json()
        assert body["ok"] is True
        assert body["migrated"]["spots"] >= 1

        # 4) Verify spot now belongs to new user
        listr = session.get(f"{API}/spots", params={"user_id": new_user_id})
        assert listr.status_code == 200
        ids = [s["id"] for s in listr.json()]
        assert spot_id in ids


# =========================
# END-TO-END: register-with-guest_user_id triggers migration
# =========================
class TestE2EMigrationViaRegister:
    def test_register_migrates_guest_data(self, session):
        # 1) Seed a guest spot
        guest_id = f"guest_{uuid.uuid4().hex[:12]}"
        spot_r = session.post(f"{API}/spots", json={
            "user_id": guest_id, "name": "TEST_E2E_Spot", "lat": 27.76, "lon": -82.76
        })
        assert spot_r.status_code == 200
        spot_id = spot_r.json()["id"]

        # 2) Register with guest_user_id => should migrate
        email = _unique_email("e2e")
        r = session.post(f"{API}/auth/register", json={
            "email": email, "password": "strongPass1234",
            "name": "E2E", "guest_user_id": guest_id
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["migrated"]["spots"] >= 1
        new_user_id = data["user"]["user_id"]

        # 3) Spot now belongs to new user
        listr = session.get(f"{API}/spots", params={"user_id": new_user_id})
        ids = [s["id"] for s in listr.json()]
        assert spot_id in ids

        # And NOT in guest list anymore
        oldr = session.get(f"{API}/spots", params={"user_id": guest_id})
        old_ids = [s["id"] for s in oldr.json()]
        assert spot_id not in old_ids


# =========================
# REGRESSION: existing endpoints still work
# =========================
class TestRegression:
    def test_forecast_still_works(self, session):
        r = session.get(f"{API}/forecast", params={"lat": 27.76, "lon": -82.76}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "today_score" in data and "score" in data["today_score"]
        assert "safety" in data and "level" in data["safety"]
        assert "factors" in data["today_score"]

    def test_spots_list_still_works_without_auth(self, session):
        guest_id = f"guest_regr_{uuid.uuid4().hex[:8]}"
        r = session.get(f"{API}/spots", params={"user_id": guest_id})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_spots_create_still_works_without_auth(self, session):
        guest_id = f"guest_regr_{uuid.uuid4().hex[:8]}"
        r = session.post(f"{API}/spots", json={
            "user_id": guest_id, "name": "TEST_NoAuth_Spot", "lat": 27.0, "lon": -82.0
        })
        assert r.status_code == 200
        assert r.json()["user_id"] == guest_id
        assert r.json()["id"]

    def test_root_api(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("message") == "Anglerj API"


# =========================
# MONGO INDEX CHECKS (via behavior)
# =========================
class TestEmailUniquenessBehavior:
    def test_duplicate_email_blocked_by_register(self, session):
        """Behavioral check: users.email unique index is enforced (via 409 from register)."""
        email = _unique_email("uniq")
        r1 = session.post(f"{API}/auth/register", json={
            "email": email, "password": "strongPass1234"
        })
        assert r1.status_code == 200
        r2 = session.post(f"{API}/auth/register", json={
            "email": email, "password": "strongPass1234"
        })
        assert r2.status_code == 409
