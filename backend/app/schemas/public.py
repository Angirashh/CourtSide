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
    round_label: str
    court_name: Optional[str] = None
    player1_name: str
    player2_name: str


class PublicCourtMatch(BaseModel):
    id: str
    stage: str
    round_num: int
    round_label: str
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


class TeamFriendlyResult(BaseModel):
    """Set once every TEAM_FRIENDLY crossover match is decided. `winner` is None on a
    genuine tie (same matches won AND same point difference) — mirrors the same
    matches-won-then-point-difference tiebreak the live standings card uses."""
    winner: Optional[str] = None  # "A" or "B", or None if tied
    team_a_matches_won: int
    team_b_matches_won: int
    team_a_point_diff: int
    team_b_point_diff: int


class PublicTournamentSummary(BaseModel):
    id: str
    name: str
    format: TournamentFormat
    category: Optional[TournamentCategory] = None
    status: TournamentStatus
    venue: Optional[str] = None
    venue_link: Optional[str] = None
    tournament_date: Optional[date] = None
    # The organiser's actual kickoff time, once a schedule exists — the earliest
    # scheduled match's start. None before a schedule is generated, in which case
    # callers fall back to just the date.
    earliest_match_start_time: Optional[datetime] = None
    players_count: int
    courts_count: int
    created_at: datetime
    live_matches: List[PublicLiveMatch] = []
    court_queues: List[PublicCourtQueue] = []
    # Set only once the tournament is COMPLETED and its knockout final was actually played.
    champion_name: Optional[str] = None
    runner_up_name: Optional[str] = None
    team_friendly_result: Optional[TeamFriendlyResult] = None
    matches_completed: int = 0
    matches_total: int = 0

    model_config = ConfigDict(from_attributes=True)


class PublicTournamentDetail(BaseModel):
    id: str
    name: str
    format: TournamentFormat
    category: Optional[TournamentCategory] = None
    status: TournamentStatus
    venue: Optional[str] = None
    venue_link: Optional[str] = None
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
