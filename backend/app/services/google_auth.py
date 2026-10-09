import httpx
from fastapi import HTTPException

from app.core.config import settings

_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"


def verify_google_id_token(id_token: str) -> dict:
    """Verifies a Google Identity Services ID token and returns its payload (email, name, etc).

    Uses Google's tokeninfo endpoint rather than a signature-verification library -- fine at our
    volume, and keeps us on the httpx dependency already used elsewhere in the codebase.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured on the server yet.")

    try:
        resp = httpx.get(_TOKENINFO_URL, params={"id_token": id_token}, timeout=10)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not reach Google to verify sign-in. Please try again.")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="That Google sign-in could not be verified. Please try again.")

    payload = resp.json()
    if payload.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="That Google sign-in could not be verified. Please try again.")
    if payload.get("email_verified") not in ("true", True):
        raise HTTPException(
            status_code=401, detail="Your Google email isn't verified. Please verify it with Google first."
        )

    return payload
