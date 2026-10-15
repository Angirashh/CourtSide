from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, ConfigDict, Field, EmailStr, field_validator

from app.core.phone import normalize_indian_phone
from app.db.models import TournamentCategory, TournamentFormat, TournamentStatus

Gender = Literal["MALE", "FEMALE", "PREFER_NOT_TO_SAY"]
DominantHand = Literal["LEFT", "RIGHT"]
PreferredFormat = Literal["SINGLES", "DOUBLES", "MIXED_DOUBLES"]


class AthleteBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, examples=["Viktor Axelsen"])
    email: Optional[EmailStr] = Field(None, examples=["viktor@badminton.org"])
    phone: Optional[str] = Field(None, examples=["9876543210"])
    club_or_city: Optional[str] = Field(None, max_length=100, examples=["Odense"])

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        return normalize_indian_phone(v)


class AthleteCreate(AthleteBase):
    pass


class AthleteUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    club_or_city: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        return normalize_indian_phone(v)


class AthleteResponse(AthleteBase):
    id: str
    gender: Optional[Gender] = None
    dominant_hand: Optional[DominantHand] = None
    preferred_formats: List[PreferredFormat] = []
    bio: Optional[str] = None
    ranking_points: float
    tournaments_played: int
    matches_played: int
    matches_won: int
    matches_lost: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AthleteProfileUpdate(BaseModel):
    """Self-service profile fields a signed-in player can edit on their own `Athlete` row
    via `PATCH /athletes/me`. Deliberately excludes name/email/phone/club_or_city -- those
    already go through the pre-existing (if unauthenticated) `PATCH /athletes/{athlete_id}`."""
    gender: Optional[Gender] = None
    dominant_hand: Optional[DominantHand] = None
    preferred_formats: Optional[List[PreferredFormat]] = None
    bio: Optional[str] = Field(None, max_length=300)


class AthleteLeaderboardEntry(BaseModel):
    rank: int
    id: str
    name: str
    club_or_city: Optional[str] = None
    ranking_points: float
    tournaments_played: int
    matches_won: int
    matches_lost: int
    win_rate_percentage: float

    model_config = ConfigDict(from_attributes=True)


class AthleteTournamentHistory(BaseModel):
    tournament_id: str
    tournament_name: str
    tournament_date: datetime
    category: Optional[TournamentCategory] = None
    format: TournamentFormat
    tournament_status: TournamentStatus
    seed: Optional[int] = None
    final_placement: Optional[int] = None
    points_earned: float

    model_config = ConfigDict(from_attributes=True)


class AthleteCategoryStats(BaseModel):
    category: Optional[TournamentCategory] = None  # None = tournaments with no category set
    tournaments_played: int
    matches_played: int
    matches_won: int
    matches_lost: int
    win_rate_percentage: float


class AthleteDetailResponse(AthleteResponse):
    win_rate_percentage: float
    history: List[AthleteTournamentHistory] = []
    stats_by_category: List[AthleteCategoryStats] = []