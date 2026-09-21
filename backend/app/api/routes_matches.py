from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser, ensure_tournament_access, get_db, require_operator_or_organiser
from app.db import models
from app.schemas.match import MatchResponse, MatchScoreSubmission
from app.services.match_progression import finalize_match_result

router = APIRouter(tags=["Matches"])


# =====================================================================
# QUERY MATCHES
# =====================================================================
@router.get("/tournaments/{tournament_id}/matches", response_model=List[MatchResponse])
def list_tournament_matches(
    tournament_id: str,
    stage: Optional[models.MatchStage] = None,
    round_num: Optional[int] = None,
    court_id: Optional[str] = None,
    is_completed: Optional[bool] = None,
    match_status: Optional[models.MatchStatus] = None,
    current_user: CurrentUser = Depends(require_operator_or_organiser),
    db: Session = Depends(get_db)
):
    """
    Retrieves tournament matches with optional filtering by stage, round, court, or status.
    Used by court operators and referee scoreboards.
    """
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    query = db.query(models.Match).filter(models.Match.tournament_id == tournament_id)

    if stage:
        query = query.filter(models.Match.stage == stage)
    if round_num is not None:
        query = query.filter(models.Match.round_num == round_num)
    if court_id:
        query = query.filter(models.Match.court_id == court_id)
    if is_completed is not None:
        query = query.filter(models.Match.is_completed == is_completed)
    if match_status is not None:
        query = query.filter(models.Match.status == match_status)

    return query.order_by(models.Match.scheduled_start_time.asc().nullslast(), models.Match.id.asc()).all()


@router.get("/matches/{match_id}", response_model=MatchResponse)
def get_match(
    match_id: str,
    current_user: CurrentUser = Depends(require_operator_or_organiser),
    db: Session = Depends(get_db),
):
    """Fetches details for a single match."""
    match = db.query(models.Match).filter(models.Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    tournament = db.query(models.Tournament).filter(models.Tournament.id == match.tournament_id).first()
    ensure_tournament_access(tournament, current_user, db)
    return match


# =====================================================================
# START MATCH
# =====================================================================
@router.post("/matches/{match_id}/start", response_model=MatchResponse)
def start_match(
    match_id: str,
    current_user: CurrentUser = Depends(require_operator_or_organiser),
    db: Session = Depends(get_db),
):
    """Court operator endpoint: marks a match as underway on its assigned court."""
    match = db.query(models.Match).filter(models.Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    tournament = db.query(models.Tournament).filter(models.Tournament.id == match.tournament_id).first()
    ensure_tournament_access(tournament, current_user, db)

    if match.is_bye:
        raise HTTPException(status_code=400, detail="Bye matches resolve automatically and cannot be started.")
    if match.is_completed:
        raise HTTPException(status_code=400, detail="Match has already been completed.")
    if match.status == models.MatchStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Match has already been started.")
    if not match.player1_id or not match.player2_id or "TBD" in match.player1_id or "TBD" in match.player2_id:
        raise HTTPException(status_code=400, detail="Both players must be finalized before this match can start.")

    match.status = models.MatchStatus.IN_PROGRESS
    match.actual_start_time = datetime.utcnow()
    match.operator_id = current_user.id
    db.commit()
    db.refresh(match)
    return match


# =====================================================================
# SUBMIT SCORE & AUTOMATE PROGRESSION
# =====================================================================
@router.post("/matches/{match_id}/score", response_model=MatchResponse)
def submit_match_score(
    match_id: str,
    payload: MatchScoreSubmission,
    current_user: CurrentUser = Depends(require_operator_or_organiser),
    db: Session = Depends(get_db)
):
    """
    Court operator endpoint to record scores.
    Triggers dynamic winner advancement, group stage transitions,
    and automatic Swiss round pairing generation.
    """
    match = db.query(models.Match).filter(models.Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    tournament = db.query(models.Tournament).filter(models.Tournament.id == match.tournament_id).first()
    ensure_tournament_access(tournament, current_user, db)

    if match.is_completed:
        raise HTTPException(status_code=400, detail="Match score has already been submitted and finalized.")

    if payload.winner_id not in (match.player1_id, match.player2_id):
        raise HTTPException(
            status_code=400,
            detail=f"Winner {payload.winner_id} is not one of the participants ({match.player1_id}, {match.player2_id})"
        )

    p1_sets = sum(1 for s in payload.scores if s.p1 > s.p2)
    p2_sets = sum(1 for s in payload.scores if s.p2 > s.p1)
    winner_sets, loser_sets = (p1_sets, p2_sets) if payload.winner_id == match.player1_id else (p2_sets, p1_sets)
    if winner_sets <= loser_sets:
        raise HTTPException(
            status_code=400,
            detail="The scores don't match the selected winner: the winner must win more sets than the opponent."
        )

    finalize_match_result(
        match,
        winner_id=payload.winner_id,
        db=db,
        scores=[score.model_dump() for score in payload.scores],
    )

    db.commit()
    db.refresh(match)
    return match
