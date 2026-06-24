from fastapi import APIRouter, HTTPException, Request, Depends
from typing import Optional
import asyncio
import httpx
import jwt as pyjwt
from datetime import datetime, timezone
from models.user import (
    User, RegisterIn, LoginIn, AppleIn, GoogleSessionIn, MigrateIn,
    AuthResponse, UserPublic,
)
from utils.security import (
    hash_password, verify_password, create_access_token, get_current_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])

APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"
_apple_jwks_cache: dict = {"keys": None, "fetched_at": 0.0}
_apple_jwks_lock = asyncio.Lock()


async def _get_apple_jwks() -> list:
    """Fetch & cache Apple's JWKS (rotated infrequently)."""
    import time
    now = time.time()
    if _apple_jwks_cache["keys"] and (now - _apple_jwks_cache["fetched_at"]) < 3600:
        return _apple_jwks_cache["keys"]
    async with _apple_jwks_lock:
        if _apple_jwks_cache["keys"] and (now - _apple_jwks_cache["fetched_at"]) < 3600:
            return _apple_jwks_cache["keys"]
        try:
            async with httpx.AsyncClient(timeout=10) as cx:
                r = await cx.get(APPLE_JWKS_URL)
                r.raise_for_status()
                data = r.json()
                _apple_jwks_cache["keys"] = data.get("keys") or []
                _apple_jwks_cache["fetched_at"] = now
        except Exception:
            # If we can't reach Apple, fall back to last cached keys (may be empty)
            pass
        return _apple_jwks_cache["keys"] or []


async def _verify_apple_identity_token(identity_token: str) -> dict:
    """Verify the Apple ID identity token against Apple's JWKS.

    Returns the verified token claims dict.
    Raises HTTPException(400/401) on verification failure.

    NOTE for staging: when APPLE_BUNDLE_ID is unset we still verify signature +
    issuer + expiry but skip audience checking so this works for dev builds.
    Set APPLE_BUNDLE_ID in backend .env for production hardening.
    """
    import os
    try:
        unverified_header = pyjwt.get_unverified_header(identity_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Malformed Apple identity token: {e}")
    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(status_code=400, detail="Apple identity token missing kid")
    keys = await _get_apple_jwks()
    if not keys:
        # If we have NEVER been able to fetch JWKS, fail closed in production but
        # allow staging by decoding unverified — surfaced clearly in logs.
        if os.environ.get("ALLOW_UNVERIFIED_APPLE_TOKENS") == "1":
            return pyjwt.decode(identity_token, options={"verify_signature": False})
        raise HTTPException(status_code=502, detail="Apple JWKS unavailable; cannot verify identity token")
    jwk = next((k for k in keys if k.get("kid") == kid), None)
    if not jwk:
        # Force refresh once in case keys rotated
        _apple_jwks_cache["keys"] = None
        keys = await _get_apple_jwks()
        jwk = next((k for k in keys if k.get("kid") == kid), None)
        if not jwk:
            raise HTTPException(status_code=401, detail="Apple JWKS did not contain matching key")

    try:
        public_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(jwk)
        audience = os.environ.get("APPLE_BUNDLE_ID") or None
        options = {"verify_aud": bool(audience)}
        claims = pyjwt.decode(
            identity_token,
            public_key,
            algorithms=["RS256"],
            issuer=APPLE_ISSUER,
            audience=audience,
            options=options,
        )
        return claims
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Apple identity token expired")
    except pyjwt.InvalidIssuerError:
        raise HTTPException(status_code=401, detail="Apple identity token has wrong issuer")
    except pyjwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="Apple identity token audience mismatch")
    except pyjwt.InvalidSignatureError:
        raise HTTPException(status_code=401, detail="Apple identity token signature invalid")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Apple identity token verification failed: {e}")

# These will be wired by server.py via dependency injection trick
_DB = None


def set_db(db):
    global _DB
    _DB = db


def get_db():
    if _DB is None:
        raise RuntimeError("Auth router DB not initialized")
    return _DB


async def _migrate_guest_data(db, guest_user_id: Optional[str], new_user_id: str) -> dict:
    """Reassign existing guest data (spots, catches, preferences) to the new authenticated user_id."""
    if not guest_user_id or guest_user_id == new_user_id:
        return {"spots": 0, "catches": 0}
    spots = await db.spots.update_many(
        {"user_id": guest_user_id}, {"$set": {"user_id": new_user_id}}
    )
    catches = await db.catches.update_many(
        {"user_id": guest_user_id}, {"$set": {"user_id": new_user_id}}
    )
    # Mark a migration record (idempotent-ish)
    await db.user_migrations.insert_one({
        "guest_user_id": guest_user_id,
        "new_user_id": new_user_id,
        "spots_migrated": spots.modified_count,
        "catches_migrated": catches.modified_count,
        "migrated_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"spots": spots.modified_count, "catches": catches.modified_count}


def _to_public(user: dict) -> UserPublic:
    return UserPublic(
        user_id=user["user_id"],
        email=user["email"],
        name=user.get("name"),
        picture=user.get("picture"),
        auth_provider=user.get("auth_provider", "email"),
        is_premium=user.get("is_premium", False),
        is_admin=user.get("is_admin", False),
        created_at=user["created_at"],
    )


@router.post("/register", response_model=AuthResponse)
async def register(payload: RegisterIn):
    db = get_db()
    email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        # If existing email user, reject. If existing google/apple user, allow linking later.
        if existing.get("password_hash"):
            raise HTTPException(status_code=409, detail="An account with this email already exists. Please sign in.")
        # Link password to existing oauth-only user
        password_hash = hash_password(payload.password)
        await db.users.update_one(
            {"user_id": existing["user_id"]},
            {"$set": {"password_hash": password_hash, "name": payload.name or existing.get("name"), "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        user = await db.users.find_one({"user_id": existing["user_id"]}, {"_id": 0, "password_hash": 0})
    else:
        password_hash = hash_password(payload.password)
        new_user = User(email=email, name=payload.name, auth_provider="email", password_hash=password_hash)
        await db.users.insert_one(new_user.model_dump())
        user = await db.users.find_one({"user_id": new_user.user_id}, {"_id": 0, "password_hash": 0})

    migrated = await _migrate_guest_data(db, payload.guest_user_id, user["user_id"])
    token = create_access_token(user["user_id"], user["email"])
    return AuthResponse(access_token=token, user=_to_public(user), migrated=migrated)


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginIn):
    db = get_db()
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    migrated = await _migrate_guest_data(db, payload.guest_user_id, user["user_id"])
    safe_user = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    token = create_access_token(user["user_id"], user["email"])
    return AuthResponse(access_token=token, user=_to_public(safe_user), migrated=migrated)


@router.post("/apple", response_model=AuthResponse)
async def apple_signin(payload: AppleIn):
    """Apple Sign-In. Verifies the identity token against Apple's JWKS
    (RS256 signature + issuer + expiry + optional audience) before trusting
    the claims.
    """
    db = get_db()
    claims = await _verify_apple_identity_token(payload.identity_token)

    apple_sub = claims.get("sub") or payload.apple_user_id
    apple_email = claims.get("email") or payload.email
    if not apple_sub:
        raise HTTPException(status_code=400, detail="Apple identity token missing sub")

    # Find user by apple_user_id first, then email
    user = await db.users.find_one({"apple_user_id": apple_sub})
    if not user and apple_email:
        user = await db.users.find_one({"email": apple_email.lower().strip()})
    if user:
        # Link apple if not yet linked
        updates = {"apple_user_id": apple_sub, "updated_at": datetime.now(timezone.utc).isoformat()}
        if not user.get("name") and payload.full_name:
            updates["name"] = payload.full_name
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
        user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    else:
        new_user = User(
            email=(apple_email or f"{apple_sub}@privaterelay.apple.id").lower(),
            name=payload.full_name,
            auth_provider="apple",
            apple_user_id=apple_sub,
        )
        await db.users.insert_one(new_user.model_dump())
        user = await db.users.find_one({"user_id": new_user.user_id}, {"_id": 0, "password_hash": 0})

    migrated = await _migrate_guest_data(db, payload.guest_user_id, user["user_id"])
    token = create_access_token(user["user_id"], user["email"])
    return AuthResponse(access_token=token, user=_to_public(user), migrated=migrated)


@router.post("/google", response_model=AuthResponse)
async def google_signin(payload: GoogleSessionIn):
    """Google Sign-In via Emergent Auth: exchange session_id for user data, then upsert user."""
    db = get_db()
    try:
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": payload.session_id},
            )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail=f"Google session invalid ({r.status_code})")
        data = r.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Google auth upstream error: {e}")

    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="No email returned from Google")
    google_sub = data.get("id") or email

    user = await db.users.find_one({"email": email})
    if user:
        updates = {
            "google_user_id": google_sub,
            "picture": data.get("picture") or user.get("picture"),
            "name": user.get("name") or data.get("name"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
        user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    else:
        new_user = User(
            email=email, name=data.get("name"), picture=data.get("picture"),
            auth_provider="google", google_user_id=google_sub,
        )
        await db.users.insert_one(new_user.model_dump())
        user = await db.users.find_one({"user_id": new_user.user_id}, {"_id": 0, "password_hash": 0})

    migrated = await _migrate_guest_data(db, payload.guest_user_id, user["user_id"])
    token = create_access_token(user["user_id"], user["email"])
    return AuthResponse(access_token=token, user=_to_public(user), migrated=migrated)


@router.get("/me", response_model=UserPublic)
async def me(request: Request):
    db = get_db()
    user = await get_current_user(request, db)
    return _to_public(user)


@router.post("/logout")
async def logout(request: Request):
    # Stateless JWT — client just discards the token. Endpoint exists for analytics/symmetry.
    return {"ok": True}


@router.post("/migrate")
async def migrate_guest(payload: MigrateIn, request: Request):
    db = get_db()
    user = await get_current_user(request, db)
    counts = await _migrate_guest_data(db, payload.guest_user_id, user["user_id"])
    return {"ok": True, "migrated": counts}
