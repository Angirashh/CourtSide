import re

_INDIA_MOBILE_RE = re.compile(r"^[6-9]\d{9}$")


def normalize_indian_phone(raw: str) -> str:
    """Validates a 10-digit Indian mobile number and returns it as +91XXXXXXXXXX.

    Tolerates a few common ways people paste/type it (leading 0, leading 91 or +91)
    but always canonicalizes to the same E.164 shape so stored numbers compare equal.
    """
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]

    if not _INDIA_MOBILE_RE.match(digits):
        raise ValueError("Enter a valid 10-digit Indian mobile number")

    return f"+91{digits}"
