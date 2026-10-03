import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser, ensure_tournament_access, get_db, require_organiser
from app.db import models
from app.schemas.tournament import CourtCreate, CourtResponse, CourtUpdate

router = APIRouter(prefix="/tournaments/{tournament_id}/courts", tags=["Courts"])


def _get_tournament(tournament_id: str, current_user: CurrentUser, db: Session) -> models.Tournament:
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)
    return tournament


@router.post("", response_model=CourtResponse, status_code=status.HTTP_201_CREATED)
def add_court(
    tournament_id: str,
    payload: CourtCreate,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """Adds a court to the tournament's available list. Safe at any status — real-world court
    availability can change any time; an already-generated schedule simply won't use the new
    court until it's regenerated, since court assignment only happens at that step."""
    _get_tournament(tournament_id, current_user, db)
    court = models.Court(
        id=f"CRT_{uuid.uuid4().hex[:8]}",
        tournament_id=tournament_id,
        name=payload.name,
        hourly_rate=payload.hourly_rate,
    )
    db.add(court)
    db.commit()
    db.refresh(court)
    return court


@router.patch("/{court_id}", response_model=CourtResponse)
def update_court(
    tournament_id: str,
    court_id: str,
    payload: CourtUpdate,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """Renames a court or updates its hourly rate. Matches reference courts by ID (not name), so
    this is safe at any tournament status, including mid-match — a match already in progress on
    this court keeps pointing at the same row and just picks up the new name on its next poll."""
    _get_tournament(tournament_id, current_user, db)
    court = db.query(models.Court).filter(
        models.Court.id == court_id, models.Court.tournament_id == tournament_id
    ).first()
    if not court:
        raise HTTPException(status_code=404, detail="Court not found in this tournament.")

    if payload.name is not None:
        court.name = payload.name
    if payload.hourly_rate is not None:
        court.hourly_rate = payload.hourly_rate

    db.commit()
    db.refresh(court)
    return court


@router.delete("/{court_id}")
def remove_court(
    tournament_id: str,
    court_id: str,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """Removes a court, unless it still has a scheduled or in-progress match assigned — that
    match would otherwise be silently orphaned (its court_id set to NULL)."""
    _get_tournament(tournament_id, current_user, db)
    court = db.query(models.Court).filter(
        models.Court.id == court_id, models.Court.tournament_id == tournament_id
    ).first()
    if not court:
        raise HTTPException(status_code=404, detail="Court not found in this tournament.")

    pending = db.query(models.Match).filter(
        models.Match.court_id == court_id, models.Match.is_completed == False
    ).first()
    if pending:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove a court with a scheduled or in-progress match on it. Finish that match, or wait until it's reassigned by a schedule regeneration, first.",
        )

    db.delete(court)
    db.commit()
    return {"message": "Court removed.", "court_id": court_id}
