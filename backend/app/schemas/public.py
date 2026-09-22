from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from app.db.models import MatchStatus, TournamentFormat, TournamentStatus, TournamentCategory
from app.schemas.player import PlayerResponse
from app.schemas.match import MatchResponse
from app.schemas.tournament import CourtResponse


# =====================================================================
# PUBLIC (UNAUTHENTICATED) TOURNAMENT SCHEMAS
# Deliberately exclude anything organiser-sensitive — schedule_summary's
# court costs/savings, organiser identity, etc.
# =====================================================================
class PublicLiveMatch(BaseModel):
    id: str
    stage: str
    round_num: int
    court_name: Optional[str] = None
    player1_name: str
    player2_name: str


class PublicCourtMatch(BaseModel):
    id: str
    stage: str
    round_num: int
    status: MatchStatus
    scheduled_start_time: Optional[datetime] = None
    player1_name: str
    player2_name: str
    # Knockout slots not yet decided are placeholder players with machine-ish names
    # (e.g. "TBD_R1_M1_Win"); the client prettifies those, so it needs to know which are.
    player1_is_placeholder: bool = False
    player2_is_placeholder: bool = False


class PublicCourtQueue(BaseModel):
    """One court's live match (if any) and its next upcoming matches."""
    court_id: str
    court_name: str
    matches: List[PublicCourtMatch]
    more_upcoming: int = 0  # upcoming matches beyond the ones listed


class PublicTournamentSummary(BaseModel):
    id: str
    name: str
    format: TournamentFormat
    category: Optional[TournamentCategory] = None
    status: TournamentStatus
    venue: Optional[str] = None
    tournament_date: Optional[date] = None
    players_count: int
    courts_count: int
    created_at: datetime
    live_matches: List[PublicLiveMatch] = []
    court_queues: List[PublicCourtQueue] = []

    model_config = ConfigDict(from_attributes=True)


class PublicTournamentDetail(BaseModel):
    id: str
    name: str
    format: TournamentFormat
    category: Optional[TournamentCategory] = None
    status: TournamentStatus
    venue: Optional[str] = None
    tournament_date: Optional[date] = None
    courts: List[CourtResponse] = []
    players: List[PlayerResponse] = []
    matches: List[MatchResponse] = []

    model_config = ConfigDict(from_attributes=True)


class PublicStandingRow(BaseModel):
    rank: int
    player_id: str
    player_name: str
    matches_played: int
    matches_won: int
    matches_lost: int
    games_won: int
    games_lost: int
    points_won: int
    points_lost: int
    match_points: float


class PublicHubStats(BaseModel):
    """Aggregate, live-computed activity numbers for the landing page's stat tiles."""
    live_tournaments: int
    upcoming_tournaments: int
    matches_completed_live: int
    courts_in_use: int
    athletes_in_competition: int
