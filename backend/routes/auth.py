from fastapi import APIRouter, HTTPException, Request, Depends
from typing import Optional
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
    """Apple Sign-In. We decode the identity token (without RS256 verification for MVP)
    to extract sub/email. NOTE: For production, verify against Apple's JWKS.
    """
    db = get_db()
    # Decode without signature verification (Apple's JWKS verification is a TODO for production hardening)
    try:
        unverified = pyjwt.decode(payload.identity_token, options={"verify_signature": False})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Apple identity token: {e}")

    apple_sub = unverified.get("sub") or payload.apple_user_id
    apple_email = unverified.get("email") or payload.email
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
