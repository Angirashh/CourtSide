from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict, model_validator, field_validator
from app.core.phone import normalize_indian_phone
from app.db.models import UserRole


# =====================================================================
# SHARED
# =====================================================================
class UserResponse(BaseModel):
    id: str
    name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: UserRole
    is_superadmin: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    user: UserResponse
    tournament_id: Optional[str] = Field(
        default=None, description="Present for OPERATOR tokens; scopes the session to one tournament."
    )


# =====================================================================
# ORGANISER SIGNUP / LOGIN
# =====================================================================
class OrganiserSignup(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    email: Optional[str] = None
    phone: Optional[str] = None
    pin: str = Field(..., min_length=4, max_length=20, description="Chosen login PIN/password.")

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        return normalize_indian_phone(v)

    @model_validator(mode="after")
    def require_identifier(self):
        if not self.email and not self.phone:
            raise ValueError("At least one of email or phone is required.")
        return self


class OrganiserLogin(BaseModel):
    identifier: str = Field(..., description="Email or phone used at signup.")
    pin: str


class OrganiserSignupResponse(BaseModel):
    """
    Returned instead of a TokenResponse: a new organiser signup has no session until a
    superadmin approves it, so there's no token to hand back yet.
    """
    status: str = "pending"
    message: str = "Your request has been sent to the tournament admin. You'll be able to log in once it's approved."


class PendingOrganiserResponse(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =====================================================================
# OPERATOR INVITE / LOGIN
# =====================================================================
class OperatorInviteRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    email: Optional[str] = None
    phone: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        return normalize_indian_phone(v)

    @model_validator(mode="after")
    def require_identifier(self):
        if not self.email and not self.phone:
            raise ValueError("At least one of email or phone is required.")
        return self


class OperatorInviteResponse(BaseModel):
    operator_id: str
    name: str
    tournament_id: str
    invite_code: str = Field(..., description="Share this with the operator out-of-band. Shown only once.")


class OperatorLogin(BaseModel):
    identifier: str = Field(..., description="Email or phone the operator was invited with.")
    tournament_id: str
    # Optional while PIN verification is disabled (see routes_auth.operator_login) — kept on the
    # schema so it keeps working unchanged once that check is switched back on.
    pin: Optional[str] = Field(None, description="The invite code shared by the organiser.")


class OperatorCourtInfo(BaseModel):
    id: str
    name: str


class CoOrganiserAddRequest(BaseModel):
    identifier: str = Field(..., description="Email or phone of an existing, approved organiser account.")


class CoOrganiserResponse(BaseModel):
    organiser_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    added_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =====================================================================
# PLAYER SIGN-UP / LOGIN (Google Sign-In)
# =====================================================================
class PlayerGoogleAuthRequest(BaseModel):
    id_token: str = Field(..., description="The ID token (credential) returned by Google Identity Services.")


class PlayerGoogleAuthResponse(BaseModel):
    """
    Returned by POST /auth/player/google. If `account_exists` is True, `session` is a complete
    login. Otherwise this Google identity has never signed up here -- the client collects a
    phone number from the user and calls /auth/player/google/complete-signup with `signup_token`
    to finish creating the account.
    """
    account_exists: bool
    session: Optional[TokenResponse] = None
    signup_token: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None


class PlayerGoogleSignupCompleteRequest(BaseModel):
    signup_token: str
    phone: str = Field(..., description="10-digit Indian mobile number.")

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, v: str) -> str:
        return normalize_indian_phone(v)


class PlayerSignupResponse(TokenResponse):
    claimed_existing_record: bool = Field(
        ..., description="True if this signup just linked an organiser-added roster entry to a new account."
    )


class PlayerClaimEmailRequest(BaseModel):
    """
    Lets an existing PLAYER row that only has a placeholder/test email (true phone numbers were
    seeded from production rosters before email collection existed) set their real email, by
    proving they know the phone number already on the account. No OTP: this is a self-service
    data correction, not an authentication event -- the account still only ever logs in via
    Google, against whatever email is set here.
    """
    phone: str = Field(..., description="10-digit Indian mobile number already on your account.")
    email: str = Field(..., description="Your real email -- must match the Google account you'll sign in with.")

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, v: str) -> str:
        return normalize_indian_phone(v)


class PlayerClaimEmailResponse(BaseModel):
    message: str = "Your email has been saved. You can now sign in with Google using that email."


class OperatorStatusResponse(BaseModel):
    """One invited operator's standing access plus their live on-court status."""
    operator_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    invited_at: datetime
    is_revoked: bool
    is_busy: bool
    current_court: Optional[OperatorCourtInfo] = None
    current_match_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
