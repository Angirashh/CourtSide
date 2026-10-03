from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from app.db.models import TournamentFormat, TournamentStatus
from app.schemas.match import MatchResponse


class PlayerBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, examples=["Viktor Axelsen"])
    seed: Optional[int] = Field(None, ge=1, examples=[1])
    is_placeholder: bool = Field(default=False, description="True for TBD slots")
    team: Optional[str] = Field(None, description="TEAM_FRIENDLY format only: 'A' or 'B'")


class PlayerCreate(PlayerBase):
    # Optional — when given, links this roster slot to the global athlete registry (matched or
    # created by email), the same as a CSV roster upload does.
    email: Optional[str] = Field(None, max_length=150, examples=["viktor@example.com"])


class PlayerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    seed: Optional[int] = Field(None, ge=1)
    is_placeholder: Optional[bool] = None
    team: Optional[str] = Field(None, description="TEAM_FRIENDLY format only: 'A' or 'B'")


class PlayerResponse(PlayerBase):
    id: str
    tournament_id: str
    is_withdrawn: bool = False
    withdrawn_at: Optional[datetime] = None
    withdrawal_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PlayerBatchCreate(BaseModel):
    players: List[PlayerCreate]


class PlayerWithdrawRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=300, examples=["Ankle injury during warmup"])


class PlayerWithdrawResponse(BaseModel):
    player: PlayerResponse
    walkover_matches: List[MatchResponse] = Field(
        default_factory=list,
        description="Matches immediately auto-completed in the withdrawn player's opponent's favor."
    )


class MyRegistrationResponse(BaseModel):
    """One tournament a logged-in player has self-registered (or been added) into — flattens
    Player + Tournament since it's built manually in the route, not loaded from a single ORM
    row."""
    tournament_id: str
    tournament_name: str
    tournament_format: TournamentFormat
    tournament_status: TournamentStatus
    tournament_date: Optional[date] = None
    venue: Optional[str] = None
    player_id: str
    seed: Optional[int] = None
    is_withdrawn: bool = False