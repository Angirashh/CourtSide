from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict, model_validator
from app.db.models import UserRole


# =====================================================================
# SHARED
# =====================================================================
class UserResponse(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    role: UserRole
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

    @model_validator(mode="after")
    def require_identifier(self):
        if not self.email and not self.phone:
            raise ValueError("At least one of email or phone is required.")
        return self


class OrganiserLogin(BaseModel):
    identifier: str = Field(..., description="Email or phone used at signup.")
    pin: str


# =====================================================================
# OPERATOR INVITE / LOGIN
# =====================================================================
class OperatorInviteRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    email: Optional[str] = None
    phone: Optional[str] = None

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
    pin: str = Field(..., description="The invite code shared by the organiser.")


class OperatorCourtInfo(BaseModel):
    id: str
    name: str


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
