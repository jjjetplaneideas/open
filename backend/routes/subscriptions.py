"""RevenueCat subscription mirror endpoints.

This module receives webhooks from RevenueCat to keep our local user
`is_premium` + `tier` fields in sync, and exposes a `/me` endpoint the
client can call as a fallback authority.

Entitlement contract (configured in the RevenueCat dashboard):
    * pro      — granted by `monthly` and `yearly` products
    * founder  — granted by `lifetime` product (implies pro)
"""

from __future__ import annotations
import os
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request

from utils.security import get_current_user

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

# Wire-in via set_db from server.py
_DB = None


def set_db(db):
    global _DB
    _DB = db


def get_db():
    if _DB is None:
        raise RuntimeError("Subscriptions router DB not initialized")
    return _DB


REVENUECAT_SECRET_KEY = os.environ.get("REVENUECAT_SECRET_API_KEY", "")
REVENUECAT_WEBHOOK_AUTH = os.environ.get("REVENUECAT_WEBHOOK_AUTH_SECRET", "")
ENTITLEMENT_PRO = "pro"
ENTITLEMENT_FOUNDER = "founder"


async def _fetch_subscriber(app_user_id: str) -> dict:
    """Authoritative entitlement fetch from RevenueCat REST API."""
    if not REVENUECAT_SECRET_KEY:
        # Allow webhooks to function in staging without secret key by trusting payload
        return {}
    url = f"https://api.revenuecat.com/v1/subscribers/{app_user_id}"
    async with httpx.AsyncClient(timeout=10) as cx:
        r = await cx.get(url, headers={"Authorization": f"Bearer {REVENUECAT_SECRET_KEY}"})
        r.raise_for_status()
        data = r.json()
    return data.get("subscriber", {}) if isinstance(data, dict) else {}


def _derive_tier(entitlements_active: dict) -> str:
    if ENTITLEMENT_FOUNDER in entitlements_active:
        return "founder"
    if ENTITLEMENT_PRO in entitlements_active:
        return "pro"
    return "free"


@router.post("/webhook")
async def revenuecat_webhook(request: Request):
    """Handle RevenueCat webhook events.

    Validates the shared Authorization header, then refreshes the canonical
    subscriber record from RevenueCat (recommended pattern) and mirrors the
    `tier` + `is_premium` fields onto the matching user document.
    """
    if REVENUECAT_WEBHOOK_AUTH:
        header = request.headers.get("Authorization") or request.headers.get("authorization")
        if header != REVENUECAT_WEBHOOK_AUTH:
            raise HTTPException(status_code=401, detail="Invalid webhook authorization")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event = payload.get("event") if isinstance(payload, dict) else None
    if not isinstance(event, dict):
        # Some webhook formats top-level the event
        event = payload if isinstance(payload, dict) else {}
    app_user_id = event.get("app_user_id") or payload.get("app_user_id")
    if not app_user_id:
        raise HTTPException(status_code=400, detail="Missing app_user_id")

    # Try authoritative fetch; fall back to event-derived state
    entitlements_active: dict = {}
    try:
        if REVENUECAT_SECRET_KEY:
            subscriber = await _fetch_subscriber(app_user_id)
            entitlements = subscriber.get("entitlements", {}) if isinstance(subscriber, dict) else {}
            now_iso = datetime.now(timezone.utc).isoformat()
            for ent_id, ent in (entitlements or {}).items():
                expires = ent.get("expires_date") if isinstance(ent, dict) else None
                if expires is None or expires > now_iso:
                    entitlements_active[ent_id] = ent
    except Exception:
        pass
    # Fallback (or no secret configured yet): read entitlements straight from the webhook event
    if not entitlements_active:
        for ent_id in (event.get("entitlement_ids") or []):
            entitlements_active[ent_id] = {"source": "webhook_event"}

    tier = _derive_tier(entitlements_active)
    is_premium = tier in ("pro", "founder")

    db = get_db()
    update = {
        "tier": tier,
        "is_premium": is_premium,
        "rc_synced_at": datetime.now(timezone.utc).isoformat(),
        "rc_entitlements": list(entitlements_active.keys()),
    }
    res = await db.users.update_one({"user_id": app_user_id}, {"$set": update})
    return {"ok": True, "event_type": event.get("type"), "tier": tier, "is_premium": is_premium,
            "matched": res.matched_count}


@router.get("/me")
async def my_subscription(request: Request):
    """Return current user's tier as seen by the backend (mirror authority)."""
    db = get_db()
    user = await get_current_user(request, db)
    return {
        "tier": user.get("tier", "free"),
        "is_premium": bool(user.get("is_premium", False)),
        "rc_entitlements": user.get("rc_entitlements") or [],
        "rc_synced_at": user.get("rc_synced_at"),
    }
