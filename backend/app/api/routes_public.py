import time
from typing import Callable, Dict, List, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, selectinload

from app.api.dependencies import get_db
from app.db import models
from app.schemas.public import (
    PublicTournamentSummary,
    PublicTournamentDetail,
    PublicStandingRow,
    PublicHubStats,
    PublicLiveMatch,
)
from app.services.fixture_engine.datatypes import (
    Player as EnginePlayer,
    Match as EngineMatch,
    MatchStage as EngineMatchStage,
)
from app.services.court_queues import build_court_queues
from app.services.standings import StandingsEngine

router = APIRouter(prefix="/public", tags=["Public Showcase"])

T = TypeVar("T")


class _TTLCache:
    """Tiny in-process cache for read-heavy public GET endpoints.

    The showcase homepage is hit far more often than tournament data actually
    changes, so a few seconds of caching removes most of the repeat DB round
    trips without making live scores feel stale. Good enough for a single
    backend instance; a multi-instance deploy would want Redis instead.
    """

    def __init__(self) -> None:
        self._store: Dict[str, tuple[float, object]] = {}

    def get_or_set(self, key: str, ttl_seconds: float, compute: Callable[[], T]) -> T:
        now = time.monotonic()
        cached = self._store.get(key)
        if cached is not None and now < cached[0]:
            return cached[1]  # type: ignore[return-value]
        value = compute()
        self._store[key] = (now + ttl_seconds, value)
        return value


_cache = _TTLCache()


# =====================================================================
# TOURNAMENT DISCOVERY (read-only, unauthenticated)
# =====================================================================
@router.get("/tournaments", response_model=List[PublicTournamentSummary])
def list_public_tournaments(response: Response, db: Session = Depends(get_db)):
    """Every tournament, for the public showcase/discovery page. No organiser-only fields."""
    response.headers["Cache-Control"] = "public, max-age=5"
    return _cache.get_or_set("tournaments", 5.0, lambda: _load_public_tournaments(db))


def _load_public_tournaments(db: Session) -> List[PublicTournamentSummary]:
    # selectinload issues one extra query per relationship (players, courts, matches)
    # instead of joinedload's single query joining all three at once — joining three
    # sibling one-to-many collections in one go multiplies their row counts together
    # (players × courts × matches per tournament), which for even a modest tournament
    # balloons into thousands of duplicate rows. selectinload keeps each query flat.
    tournaments = (
        db.query(models.Tournament)
        .options(
            selectinload(models.Tournament.players),
            selectinload(models.Tournament.courts),
            selectinload(models.Tournament.matches),
        )
        .order_by(models.Tournament.tournament_date.desc().nullslast(), models.Tournament.created_at.desc())
        .all()
    )

    result = []
    for t in tournaments:
        players_by_id = {p.id: p.name for p in t.players}
        courts_by_id = {c.id: c.name for c in t.courts}

        live_matches = []
        if t.status == models.TournamentStatus.IN_PROGRESS:
            for m in t.matches:
                if m.status != models.MatchStatus.IN_PROGRESS:
                    continue
                live_matches.append(
                    PublicLiveMatch(
                        id=m.id,
                        stage=m.stage.value,
                        round_num=m.round_num,
                        court_name=courts_by_id.get(m.court_id),
                        player1_name=players_by_id.get(m.player1_id, "TBD"),
                        player2_name=players_by_id.get(m.player2_id, "TBD"),
                    )
                )

        result.append(
            PublicTournamentSummary(
                id=t.id,
                name=t.name,
                format=t.format,
                category=t.category,
                status=t.status,
                venue=t.venue,
                tournament_date=t.tournament_date,
                players_count=len([p for p in t.players if not p.is_placeholder]),
                courts_count=len(t.courts),
                created_at=t.created_at,
                live_matches=live_matches,
                court_queues=build_court_queues(t) if t.status == models.TournamentStatus.IN_PROGRESS else [],
            )
        )
    return result


@router.get("/tournaments/{tournament_id}", response_model=PublicTournamentDetail)
def get_public_tournament(tournament_id: str, response: Response, db: Session = Depends(get_db)):
    """A single tournament's fixtures/roster for the public live view. No cost/financial data."""
    response.headers["Cache-Control"] = "public, max-age=3"
    tournament = (
        db.query(models.Tournament)
        .options(
            selectinload(models.Tournament.courts),
            selectinload(models.Tournament.players),
            selectinload(models.Tournament.matches),
        )
        .filter(models.Tournament.id == tournament_id)
        .first()
    )
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return tournament


# =====================================================================
# STANDINGS (derived live from persisted matches, not stored)
# =====================================================================
def _to_engine_match(m: models.Match) -> EngineMatch:
    engine_match = EngineMatch(
        id=m.id,
        round_num=m.round_num,
        stage=EngineMatchStage(m.stage.value),
        group_id=m.group_id,
        player1_id=m.player1_id,
        player2_id=m.player2_id,
        winner_id=m.winner_id,
        is_completed=m.is_completed,
    )
    engine_match.scores = [(s.get("p1"), s.get("p2")) for s in (m.scores or [])]
    return engine_match


def _standing_rows(standings) -> List[PublicStandingRow]:
    return [
        PublicStandingRow(
            rank=s.rank,
            player_id=s.player_id,
            player_name=s.player_name,
            matches_played=s.matches_played,
            matches_won=s.matches_won,
            matches_lost=s.matches_lost,
            games_won=s.games_won,
            games_lost=s.games_lost,
            points_won=s.points_won,
            points_lost=s.points_lost,
            match_points=s.match_points,
        )
        for s in standings
    ]


@router.get("/tournaments/{tournament_id}/standings", response_model=Dict[str, List[PublicStandingRow]])
def get_public_standings(tournament_id: str, db: Session = Depends(get_db)):
    """
    Live-computed standings, keyed by group name (GROUP_KNOCKOUT) or "SWISS" (SWISS_KNOCKOUT).
    Nothing here is persisted — it's recalculated from completed matches on every call, the
    same engine the tournament's own group/round advancement logic uses internally.
    """
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    real_players = {
        p.id: EnginePlayer(id=p.id, name=p.name, seed=p.seed or 99)
        for p in tournament.players
        if not p.is_placeholder
    }
    matches = [_to_engine_match(m) for m in tournament.matches]

    if tournament.format == models.TournamentFormat.SWISS_KNOCKOUT:
        swiss_matches = [m for m in matches if m.stage == EngineMatchStage.SWISS]
        return {
            "SWISS": _standing_rows(
                StandingsEngine.calculate_swiss_standings(list(real_players.values()), swiss_matches)
            )
        }

    group_ids = sorted({m.group_id for m in matches if m.stage == EngineMatchStage.GROUP and m.group_id})
    result = {}
    for gid in group_ids:
        group_matches = [m for m in matches if m.stage == EngineMatchStage.GROUP and m.group_id == gid]
        pool_player_ids = {m.player1_id for m in group_matches} | {m.player2_id for m in group_matches}
        pool_players = [real_players[pid] for pid in pool_player_ids if pid in real_players]
        result[gid] = _standing_rows(StandingsEngine.calculate_group_standings(pool_players, group_matches, group_id=gid))
    return result


# =====================================================================
# HUB-WIDE ACTIVITY STATS (for the landing page's "at a glance" tiles)
# =====================================================================
@router.get("/stats", response_model=PublicHubStats)
def get_public_hub_stats(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=10"
    return _cache.get_or_set("hub_stats", 10.0, lambda: _load_public_hub_stats(db))


def _load_public_hub_stats(db: Session) -> PublicHubStats:
    live_tournaments = db.query(models.Tournament).filter(
        models.Tournament.status == models.TournamentStatus.IN_PROGRESS
    ).options(selectinload(models.Tournament.players), selectinload(models.Tournament.matches)).all()

    upcoming_tournaments = db.query(models.Tournament).filter(
        models.Tournament.status.in_([models.TournamentStatus.DRAFT, models.TournamentStatus.SCHEDULING])
    ).count()

    matches_completed = sum(len([m for m in t.matches if m.is_completed]) for t in live_tournaments)
    courts_in_use = len({m.court_id for t in live_tournaments for m in t.matches if m.court_id})
    athletes_in_competition = len({p.id for t in live_tournaments for p in t.players if not p.is_placeholder})

    return PublicHubStats(
        live_tournaments=len(live_tournaments),
        upcoming_tournaments=upcoming_tournaments,
        matches_completed_live=matches_completed,
        courts_in_use=courts_in_use,
        athletes_in_competition=athletes_in_competition,
    )
