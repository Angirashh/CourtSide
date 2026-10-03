import uuid
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.api.dependencies import CurrentUser, get_db, require_player
from app.db import models
from app.schemas.athlete import (
    AthleteCreate,
    AthleteUpdate,
    AthleteResponse,
    AthleteLeaderboardEntry,
    AthleteDetailResponse,
    AthleteTournamentHistory,
    AthleteCategoryStats,
)

router = APIRouter(prefix="/athletes", tags=["Athletes & Leaderboard"])


# =====================================================================
# GLOBAL LEADERBOARD
# =====================================================================
@router.get("/leaderboard", response_model=List[AthleteLeaderboardEntry])
def get_global_leaderboard(
    limit: int = Query(default=50, ge=1, le=200, description="Top N athletes"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db)
):
    """
    Returns global leaderboard sorted by ranking points, followed by matches won.
    Computes real-time dynamic rank and career win-rate percentage.
    """
    athletes = (
        db.query(models.Athlete)
        .order_by(
            models.Athlete.ranking_points.desc(),
            models.Athlete.matches_won.desc(),
            models.Athlete.name.asc()
        )
        .offset(offset)
        .limit(limit)
        .all()
    )

    leaderboard = []
    for idx, ath in enumerate(athletes, start=offset + 1):
        win_rate = (
            round((ath.matches_won / ath.matches_played) * 100.0, 1)
            if ath.matches_played > 0
            else 0.0
        )
        leaderboard.append(
            AthleteLeaderboardEntry(
                rank=idx,
                id=ath.id,
                name=ath.name,
                club_or_city=ath.club_or_city,
                ranking_points=ath.ranking_points,
                tournaments_played=ath.tournaments_played,
                matches_won=ath.matches_won,
                matches_lost=ath.matches_lost,
                win_rate_percentage=win_rate
            )
        )

    return leaderboard


# =====================================================================
# ATHLETE DIRECTORY & SEARCH
# =====================================================================
@router.get("", response_model=List[AthleteResponse])
def list_athletes(
    search: Optional[str] = Query(None, description="Search by name, email, or club"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db)
):
    """Lists registered athletes with optional text searching."""
    query = db.query(models.Athlete)

    if search:
        search_fmt = f"%{search.strip()}%"
        query = query.filter(
            or_(
                models.Athlete.name.ilike(search_fmt),
                models.Athlete.email.ilike(search_fmt),
                models.Athlete.club_or_city.ilike(search_fmt)
            )
        )

    return query.order_by(models.Athlete.name.asc()).offset(offset).limit(limit).all()


@router.post("", response_model=AthleteResponse, status_code=status.HTTP_201_CREATED)
def create_athlete(payload: AthleteCreate, db: Session = Depends(get_db)):
    """Registers a new global athlete profile."""
    # Check for existing email or phone conflicts
    if payload.email:
        existing_email = db.query(models.Athlete).filter(models.Athlete.email == payload.email).first()
        if existing_email:
            raise HTTPException(status_code=400, detail="An athlete with this email already exists.")

    if payload.phone:
        existing_phone = db.query(models.Athlete).filter(models.Athlete.phone == payload.phone).first()
        if existing_phone:
            raise HTTPException(status_code=400, detail="An athlete with this phone number already exists.")

    athlete = models.Athlete(
        id=f"ATH_{uuid.uuid4().hex[:8]}",
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        club_or_city=payload.club_or_city,
    )
    db.add(athlete)
    db.commit()
    db.refresh(athlete)
    return athlete


# =====================================================================
# CAREER PROFILE & TOURNAMENT HISTORY
# =====================================================================
def _compute_stats_by_category(athlete_id: str, db: Session) -> List[AthleteCategoryStats]:
    """
    Breaks the athlete's career record down per tournament category, computed live from
    already-finalized (COMPLETED) tournaments rather than a persisted counter — there's
    only one career total stored on Athlete, so a category split is derived on read.
    """
    rows = (
        db.query(models.Player, models.Tournament)
        .join(models.Tournament, models.Player.tournament_id == models.Tournament.id)
        .filter(models.Player.athlete_id == athlete_id, models.Tournament.status == models.TournamentStatus.COMPLETED)
        .all()
    )

    buckets: Dict[Optional[models.TournamentCategory], List[str]] = {}
    for player, tourn in rows:
        buckets.setdefault(tourn.category, []).append(player.id)

    stats = []
    for category, player_ids in buckets.items():
        id_set = set(player_ids)
        matches = db.query(models.Match).filter(
            models.Match.is_completed == True,
            or_(models.Match.player1_id.in_(player_ids), models.Match.player2_id.in_(player_ids)),
        ).all()
        matches_played = len(matches)
        # Byes/walkovers are already resolved to a winner_id before a match is marked
        # completed, so every completed match here has one — no separate loss tally needed.
        matches_won = sum(1 for m in matches if m.winner_id in id_set)
        stats.append(AthleteCategoryStats(
            category=category,
            tournaments_played=len(player_ids),
            matches_played=matches_played,
            matches_won=matches_won,
            matches_lost=matches_played - matches_won,
            win_rate_percentage=round((matches_won / matches_played) * 100.0, 1) if matches_played else 0.0,
        ))
    return stats


def _build_athlete_detail(athlete_id: str, db: Session) -> AthleteDetailResponse:
    athlete = db.query(models.Athlete).filter(models.Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    # Fetch tournament roster entries for this athlete
    roster_entries = (
        db.query(models.Player, models.Tournament)
        .join(models.Tournament, models.Player.tournament_id == models.Tournament.id)
        .filter(models.Player.athlete_id == athlete_id)
        .order_by(models.Tournament.created_at.desc())
        .all()
    )

    history = [
        AthleteTournamentHistory(
            tournament_id=tourn.id,
            tournament_name=tourn.name,
            tournament_date=tourn.created_at,
            category=tourn.category,
            seed=player.seed,
            final_placement=player.final_placement,
            points_earned=player.ranking_points_earned
        )
        for player, tourn in roster_entries
    ]

    win_rate = (
        round((athlete.matches_won / athlete.matches_played) * 100.0, 1)
        if athlete.matches_played > 0
        else 0.0
    )

    return AthleteDetailResponse(
        id=athlete.id,
        name=athlete.name,
        email=athlete.email,
        phone=athlete.phone,
        club_or_city=athlete.club_or_city,
        ranking_points=athlete.ranking_points,
        tournaments_played=athlete.tournaments_played,
        matches_played=athlete.matches_played,
        matches_won=athlete.matches_won,
        matches_lost=athlete.matches_lost,
        win_rate_percentage=win_rate,
        history=history,
        stats_by_category=_compute_stats_by_category(athlete_id, db),
        created_at=athlete.created_at,
        updated_at=athlete.updated_at
    )


@router.get("/me", response_model=AthleteDetailResponse)
def get_my_athlete_profile(
    current_user: CurrentUser = Depends(require_player),
    db: Session = Depends(get_db),
):
    """Returns the signed-in player's own career record and tournament history."""
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user or not user.athlete_id:
        raise HTTPException(status_code=404, detail="No athlete record linked to this account.")
    return _build_athlete_detail(user.athlete_id, db)


@router.get("/{athlete_id}", response_model=AthleteDetailResponse)
def get_athlete_profile(athlete_id: str, db: Session = Depends(get_db)):
    """
    Returns detailed athlete career record, statistics,
    and a chronological timeline of all tournaments played.
    """
    return _build_athlete_detail(athlete_id, db)


@router.patch("/{athlete_id}", response_model=AthleteResponse)
def update_athlete(athlete_id: str, payload: AthleteUpdate, db: Session = Depends(get_db)):
    """Updates basic athlete biographical details."""
    athlete = db.query(models.Athlete).filter(models.Athlete.id == athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(athlete, field, val)

    db.commit()
    db.refresh(athlete)
    return athlete