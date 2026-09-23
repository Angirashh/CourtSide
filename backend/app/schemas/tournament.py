from datetime import date, datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, Field, ConfigDict
from app.db.models import TournamentFormat, TournamentStatus, TournamentCategory
from app.schemas.player import PlayerResponse
from app.schemas.match import MatchResponse


# =====================================================================
# COURT SCHEMAS
# =====================================================================
class CourtBase(BaseModel):
    name: str = Field(..., examples=["Court 1"])
    hourly_rate: float = Field(default=0.0, ge=0.0, examples=[40.0])


class CourtCreate(CourtBase):
    pass


class CourtResponse(CourtBase):
    id: str
    tournament_id: str

    model_config = ConfigDict(from_attributes=True)


# =====================================================================
# TOURNAMENT SCHEMAS
# =====================================================================
class TournamentBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150, examples=["All England Open 2026"])
    format: TournamentFormat
    category: Optional[TournamentCategory] = None
    match_duration_minutes: int = Field(default=15, ge=10, le=120)
    rest_time_minutes: int = Field(default=10, ge=0, le=120)
    shuttle_cost: float = Field(default=220.0, ge=0, examples=[220.0])
    shuttle_matches_per_unit: int = Field(default=3, ge=1, examples=[3])
    venue: Optional[str] = Field(default=None, max_length=200, examples=["Koramangala Indoor Stadium"])
    tournament_date: Optional[date] = Field(default=None, examples=["2026-10-12"])


class TournamentCreate(TournamentBase):
    category: TournamentCategory
    venue: str = Field(..., min_length=2, max_length=200, examples=["Koramangala Indoor Stadium"])
    tournament_date: date = Field(..., examples=["2026-10-12"])
    courts: Optional[List[CourtCreate]] = Field(default_factory=list)


class TournamentDetailsUpdate(BaseModel):
    """
    Organiser-side edit of pure logistics info — deliberately narrower than TournamentUpdate:
    no status/format/scheduling-parameter fields here, so this endpoint can't be used to sidestep
    the dedicated lifecycle/schedule-generation routes. Safe to call at any tournament status.
    """
    venue: Optional[str] = Field(None, min_length=2, max_length=200, examples=["Koramangala Indoor Stadium"])
    tournament_date: Optional[date] = Field(None, examples=["2026-10-12"])


class TournamentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    status: Optional[TournamentStatus] = None
    category: Optional[TournamentCategory] = None
    match_duration_minutes: Optional[int] = Field(None, ge=10, le=120)
    rest_time_minutes: Optional[int] = Field(None, ge=0, le=120)
    shuttle_cost: Optional[float] = Field(None, ge=0)
    shuttle_matches_per_unit: Optional[int] = Field(None, ge=1)
    venue: Optional[str] = Field(None, min_length=2, max_length=200)
    tournament_date: Optional[date] = None


class TournamentResponse(TournamentBase):
    id: str
    status: TournamentStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =====================================================================
# SCHEDULING ENGINE PAYLOADS
# =====================================================================
class ScheduleGenerationRequest(BaseModel):
    start_time: datetime = Field(
        ...,
        examples=["2026-10-12T09:00:00"],
        description="Target tournament kickoff datetime"
    )
    num_groups: Optional[int] = Field(
        default=2,
        ge=1,
        description="Required if format is GROUP_KNOCKOUT"
    )
    num_swiss_rounds: Optional[int] = Field(
        default=None,
        ge=1,
        description="SWISS_KNOCKOUT only. Defaults to ceil(log2(players)); at most players - 1."
    )


class CourtBookingWindow(BaseModel):
    booked_from: datetime
    booked_until: datetime
    duration_minutes: int
    billed_hours: float
    court_cost: float


class ScheduleSummary(BaseModel):
    """Persisted snapshot of the last CP-SAT run, surfaced on tournament detail."""
    generated_at: datetime
    makespan_minutes: int
    total_billable_hours: float
    total_estimated_cost: float
    flat_booking_cost: float
    savings: float
    court_bookings: Dict[str, CourtBookingWindow]


class TournamentDetailResponse(TournamentResponse):
    courts: List[CourtResponse] = []
    players: List[PlayerResponse] = []
    matches: List[MatchResponse] = []
    schedule_summary: Optional[ScheduleSummary] = None


class ScheduleGenerationResponse(BaseModel):
    tournament_id: str
    status: str
    makespan_minutes: int
    total_billable_hours: float
    total_estimated_cost: float
    flat_booking_cost: float
    savings: float
    court_bookings: Dict[str, CourtBookingWindow]
    scheduled_matches_count: int