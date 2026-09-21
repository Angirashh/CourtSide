from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, EmailStr


class AthleteBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, examples=["Viktor Axelsen"])
    email: Optional[EmailStr] = Field(None, examples=["viktor@badminton.org"])
    phone: Optional[str] = Field(None, max_length=20, examples=["+1-555-0199"])
    club_or_city: Optional[str] = Field(None, max_length=100, examples=["Odense"])


class AthleteCreate(AthleteBase):
    pass


class AthleteUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    club_or_city: Optional[str] = None


class AthleteResponse(AthleteBase):
    id: str
    ranking_points: float
    tournaments_played: int
    matches_played: int
    matches_won: int
    matches_lost: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


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
    seed: Optional[int] = None
    final_placement: Optional[int] = None
    points_earned: float

    model_config = ConfigDict(from_attributes=True)


class AthleteDetailResponse(AthleteResponse):
    win_rate_percentage: float
    history: List[AthleteTournamentHistory] = []