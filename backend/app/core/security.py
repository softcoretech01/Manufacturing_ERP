"""Password hashing (Argon2id) and RS256 JWT access/refresh tokens.

CLAUDE.md §2: JWT RS256 access token (15 min) + rotating refresh token
(opaque, DB-backed). Here the access token is a signed RS256 JWT; the refresh
token is an opaque random string whose hash is stored by the IAM module.

In dev/test the RSA key pair is generated on first use if the configured files
are absent, so the stack runs without manual key setup. In production the keys
are provided out-of-band and never generated.
"""

from __future__ import annotations

import secrets
from datetime import timedelta
from pathlib import Path
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.config import BASE_DIR, settings
from app.core.time import utcnow

_hasher = PasswordHasher()


# ─────────────────────────── Passwords ──────────────────────────────────────
def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(plain: str, stored_hash: str) -> bool:
    try:
        return _hasher.verify(stored_hash, plain)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def needs_rehash(stored_hash: str) -> bool:
    return _hasher.check_needs_rehash(stored_hash)


# ─────────────────────────── Refresh tokens ─────────────────────────────────
def new_refresh_token() -> str:
    """Opaque, high-entropy; only its hash is persisted."""
    return secrets.token_urlsafe(48)


# ─────────────────────────── RSA key management ─────────────────────────────
def _resolve(path_str: str) -> Path:
    path = Path(path_str)
    return path if path.is_absolute() else BASE_DIR / path


def ensure_dev_keys() -> None:
    """Generate an RSA-2048 pair for local dev/test if it does not yet exist."""
    priv = _resolve(settings.jwt_private_key_path)
    pub = _resolve(settings.jwt_public_key_path)
    if priv.exists() and pub.exists():
        return
    if settings.is_production:
        raise RuntimeError("JWT keys are missing in production; they must be provisioned.")
    priv.parent.mkdir(parents=True, exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    pub.write_bytes(
        key.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )


def _private_key() -> str:
    ensure_dev_keys()
    return _resolve(settings.jwt_private_key_path).read_text(encoding="utf-8")


def _public_key() -> str:
    ensure_dev_keys()
    return _resolve(settings.jwt_public_key_path).read_text(encoding="utf-8")


# ─────────────────────────── Access tokens ──────────────────────────────────
def create_access_token(
    *,
    user_uid: str,
    company_uid: str,
    session_id: str,
    extra: dict[str, Any] | None = None,
) -> str:
    now = utcnow()
    payload: dict[str, Any] = {
        "sub": user_uid,
        "company": company_uid,
        "sid": session_id,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, _private_key(), algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Raises jwt.PyJWTError subclasses on any problem; the caller maps to 401."""
    return jwt.decode(token, _public_key(), algorithms=[settings.jwt_algorithm])
