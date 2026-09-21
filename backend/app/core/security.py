import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict

import jwt

from app.core.config import settings

PBKDF2_ITERATIONS = 260_000


def hash_pin(raw_pin: str) -> str:
    """Salts and hashes a PIN/password. Stored as 'salt_hex$hash_hex'."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", raw_pin.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS)
    return f"{salt}${digest.hex()}"


def verify_pin(raw_pin: str, stored_hash: str) -> bool:
    try:
        salt, digest_hex = stored_hash.split("$", 1)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", raw_pin.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS)
    return hmac.compare_digest(digest.hex(), digest_hex)


def generate_invite_code(length: int = 6) -> str:
    """Generates a random numeric PIN, e.g. for operator invites."""
    return "".join(secrets.choice("0123456789") for _ in range(length))


def create_access_token(claims: Dict[str, Any]) -> str:
    to_encode = claims.copy()
    to_encode["exp"] = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    to_encode["iat"] = datetime.utcnow()
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    """Raises jwt.PyJWTError on an invalid/expired token; caller translates to HTTP 401."""
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
