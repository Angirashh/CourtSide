from datetime import date, datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator
from app.core.phone import normalize_indian_phone
from app.db.models import MatchStatus, TournamentFormat, TournamentStatus
from app.schemas.match import MatchResponse


class PlayerBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, examples=["Viktor Axelsen"])
    seed: Optional[int] = Field(None, ge=1, examples=[1])
    is_placeholder: bool = Field(default=False, description="True for TBD slots")
    team: Optional[str] = Field(None, description="TEAM_FRIENDLY format only: 'A' or 'B'")
    is_captain: bool = Field(default=False, description="TEAM_FRIENDLY format only: team captain")
    team_id: Optional[str] = Field(None, description="TEAM format only: the TournamentTeam this player belongs to")


class PlayerCreate(PlayerBase):
    # Optional — when given, links this roster slot to the global athlete registry (matched or
    # created by phone/email), the same as a CSV roster upload does. Required by the
    # organiser-facing "new player" endpoint (register_player) unless athlete_id is given
    # instead -- kept Optional here, rather than required, so this same schema still works for
    # linking an existing athlete (which already has its own phone on file) and for the batch/
    # placeholder paths that don't collect it.
    email: Optional[str] = Field(None, max_length=150, examples=["viktor@example.com"])
    phone: Optional[str] = Field(None, examples=["9876543210"])
    team_id: Optional[str] = None
    # Optional — when given (from the roster's "find an existing player" search), links this
    # roster slot directly to that athlete instead of matching/creating one by phone/email.
    athlete_id: Optional[str] = Field(None, examples=["ATH_abc123"])

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        return normalize_indian_phone(v)


class PlayerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    seed: Optional[int] = Field(None, ge=1)
    is_placeholder: Optional[bool] = None
    team: Optional[str] = Field(None, description="TEAM_FRIENDLY format only: 'A' or 'B'")
    team_id: Optional[str] = None


class PlayerTeamAssignment(BaseModel):
    player_id: str
    team_id: Optional[str] = None
    team: Optional[Literal["A", "B"]] = None


class PlayerTeamAssignmentsUpdate(BaseModel):
    assignments: List[PlayerTeamAssignment] = Field(..., min_length=1)


class PlayerResponse(PlayerBase):
    id: str
    tournament_id: str
    athlete_id: Optional[str] = None
    is_withdrawn: bool = False
    withdrawn_at: Optional[datetime] = None
    withdrawal_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PlayerBatchCreate(BaseModel):
    players: List[PlayerCreate]


class TeamAssignmentItem(BaseModel):
    player_id: str
    team: Optional[Literal["A", "B"]] = None
    is_captain: bool = False


class TeamAssignmentBulkUpdate(BaseModel):
    assignments: List[TeamAssignmentItem]


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


class NextMatchResponse(BaseModel):
    """The logged-in player's own next (or currently live) match in one tournament, for the
    public tournament page's "up next" widget. Flattened the same way MyRegistrationResponse
    is -- built manually in the route from Match + Player + Court, not a single ORM row."""
    match_id: str
    round_label: str
    court_name: Optional[str] = None
    status: MatchStatus
    scheduled_start_time: Optional[datetime] = None
    opponent_name: str
    opponent_is_placeholder: bool = False