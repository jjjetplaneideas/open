from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid


class User(BaseModel):
    user_id: str = Field(default_factory=lambda: f"u_{uuid.uuid4().hex[:16]}")
    email: EmailStr
    name: Optional[str] = None
    picture: Optional[str] = None
    auth_provider: str = "email"  # email | google | apple
    apple_user_id: Optional[str] = None
    google_user_id: Optional[str] = None
    password_hash: Optional[str] = None  # only for email/password users
    is_premium: bool = False
    is_admin: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: Optional[str] = None
    guest_user_id: Optional[str] = None  # for migration of guest data


class LoginIn(BaseModel):
    email: EmailStr
    password: str
    guest_user_id: Optional[str] = None


class AppleIn(BaseModel):
    identity_token: str  # JWT from Apple
    email: Optional[str] = None  # only on first sign-in
    full_name: Optional[str] = None  # "First Last"
    apple_user_id: str
    guest_user_id: Optional[str] = None


class GoogleSessionIn(BaseModel):
    session_id: str  # from Emergent Google Auth flow
    guest_user_id: Optional[str] = None


class MigrateIn(BaseModel):
    guest_user_id: str


class UserPublic(BaseModel):
    user_id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    auth_provider: str
    is_premium: bool = False
    is_admin: bool = False
    created_at: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
    migrated: dict = Field(default_factory=dict)  # counts of migrated resources
