import httpx
from fastapi import HTTPException

from app.core.config import settings

_BASE_URL = "https://control.msg91.com/api/v5/otp"


def _require_configured() -> None:
    if not settings.MSG91_AUTH_KEY or not settings.MSG91_OTP_TEMPLATE_ID:
        raise HTTPException(
            status_code=503,
            detail="Phone OTP isn't configured yet. Set MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID in the backend .env.",
        )


def send_otp(phone: str) -> None:
    """Sends an OTP SMS. `phone` must already be normalized to "+91XXXXXXXXXX"."""
    _require_configured()
    mobile = phone.lstrip("+")

    try:
        resp = httpx.post(
            _BASE_URL,
            params={"template_id": settings.MSG91_OTP_TEMPLATE_ID, "mobile": mobile},
            headers={"authkey": settings.MSG91_AUTH_KEY, "Content-Type": "application/json"},
            timeout=10.0,
        )
        data = resp.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=502, detail="Could not send OTP right now. Please try again.")

    if data.get("type") != "success":
        raise HTTPException(status_code=502, detail=data.get("message") or "Could not send OTP right now.")


def verify_otp(phone: str, otp: str) -> bool:
    """Returns True if `otp` is the currently valid code for `phone`. `phone` must already be
    normalized to "+91XXXXXXXXXX"."""
    _require_configured()
    mobile = phone.lstrip("+")

    try:
        resp = httpx.get(
            f"{_BASE_URL}/verify",
            params={"mobile": mobile, "otp": otp},
            headers={"authkey": settings.MSG91_AUTH_KEY},
            timeout=10.0,
        )
        data = resp.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=502, detail="Could not verify OTP right now. Please try again.")

    return data.get("type") == "success"
