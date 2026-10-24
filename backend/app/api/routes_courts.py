import uuid
from typing import Dict, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser, ensure_tournament_access, get_db, require_organiser
from app.api.routes_tournaments import _derive_schedule_summary
from app.db import models
from app.schemas.tournament import (
    CourtBookingWindow,
    CourtCreate,
    CourtRescheduleRequest,
    CourtRescheduleResponse,
    CourtResponse,
    CourtUpdate,
)

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
        available_from_minutes=payload.available_from_minutes,
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
    """Renames a court, or updates its hourly rate or availability delay. Matches reference courts
    by ID (not name), so this is safe at any tournament status, including mid-match — a match
    already in progress on this court keeps pointing at the same row and just picks up the new
    name on its next poll. Changing `available_from_minutes` only affects the NEXT schedule
    generation — it's a solver input, not something applied to an already-generated schedule
    (use the reschedule endpoint below for that)."""
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
    if payload.available_from_minutes is not None:
        court.available_from_minutes = payload.available_from_minutes

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
    pending_team_game = db.query(models.TeamTieGame).join(models.TeamTie).filter(
        models.TeamTie.tournament_id == tournament_id,
        models.TeamTieGame.court_id == court_id,
        models.TeamTieGame.is_completed == False,
    ).first()
    if pending or pending_team_game:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove a court with a scheduled or in-progress match on it. Finish that match, or wait until it's reassigned by a schedule regeneration, first.",
        )

    db.delete(court)
    db.commit()
    return {"message": "Court removed.", "court_id": court_id}


@router.patch("/{court_id}/reschedule", response_model=CourtRescheduleResponse)
def reschedule_court(
    tournament_id: str,
    court_id: str,
    payload: CourtRescheduleRequest,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """
    Moves a court's entire not-yet-started schedule earlier or later — e.g. the venue says this
    court isn't actually free until 1:30pm, not the planned 1:00pm. Every SCHEDULED match on the
    court shifts by the same delta, preserving the gaps between them; matches already IN_PROGRESS
    or COMPLETED on this court are left untouched, since they already happened at their real time.
    The tournament's configured rest time is NOT enforced here — an organiser manually adjusting a
    court's timing is explicitly allowed to tighten a player's turnaround below the solver's usual
    cushion. Only refuses (409), without applying any change, if the shift would literally
    double-book a player — two matches actually overlapping in time, which no amount of organiser
    intent can make physically possible.
    """
    tournament = _get_tournament(tournament_id, current_user, db)
    if tournament.status not in (models.TournamentStatus.SCHEDULING, models.TournamentStatus.IN_PROGRESS):
        raise HTTPException(
            status_code=400,
            detail="Court timing can only be edited once a schedule exists and before the tournament ends."
        )

    court = db.query(models.Court).filter(
        models.Court.id == court_id, models.Court.tournament_id == tournament_id
    ).first()
    if not court:
        raise HTTPException(status_code=404, detail="Court not found in this tournament.")

    is_team = tournament.tournament_type == models.TournamentType.TEAM
    row_model = models.TeamTieGame if is_team else models.Match
    movable_query = db.query(row_model)
    if is_team:
        movable_query = movable_query.join(models.TeamTie)
        movable_query = movable_query.filter(models.TeamTie.tournament_id == tournament_id)
    movable = movable_query.filter(
        row_model.court_id == court_id,
        row_model.status == models.MatchStatus.SCHEDULED,
        row_model.scheduled_start_time.isnot(None),
    ).all()
    if not movable:
        raise HTTPException(status_code=400, detail="This court has no upcoming scheduled matches to shift.")

    current_start = min(m.scheduled_start_time for m in movable)
    delta = payload.new_start_time - current_start
    movable_ids = {m.id for m in movable}

    # Every other not-yet-completed match in the tournament, keyed by the player(s) in it — these
    # keep their current times, so shifted matches are checked against them as they stand today.
    other_query = db.query(row_model)
    if is_team:
        other_query = other_query.join(models.TeamTie)
        other_query = other_query.filter(models.TeamTie.tournament_id == tournament_id)
    else:
        other_query = other_query.filter(models.Match.tournament_id == tournament_id)
    others = other_query.filter(
        row_model.id.notin_(movable_ids),
        row_model.status != models.MatchStatus.COMPLETED,
        row_model.scheduled_start_time.isnot(None),
    ).all()

    def participants(row):
        if is_team:
            tie = row.tie
            return [team_id for team_id in (tie.team1_id, tie.team2_id) if team_id]
        return [player_id for player_id in (row.player1_id, row.player2_id) if player_id]

    resource_label = "team" if is_team else "player"
    names = {}
    if is_team:
        names = {team.id: team.name for team in tournament.teams}
    else:
        names = {player.id: player.name for player in tournament.players}
    others_by_resource: Dict[str, List] = {}
    for other in others:
        for resource_id in participants(other):
            others_by_resource.setdefault(resource_id, []).append(other)

    seen_pairs = set()
    conflicts = []
    for m in movable:
        new_start = m.scheduled_start_time + delta
        new_end = m.scheduled_end_time + delta
        for resource_id in participants(m):
            for om in others_by_resource.get(resource_id, []):
                if (m.id, om.id) in seen_pairs:
                    continue
                # Strict time overlap only — the rest-time cushion is deliberately not enforced
                # for a manual court-timing edit, just genuine double-booking.
                overlaps = new_start < om.scheduled_end_time and om.scheduled_start_time < new_end
                if overlaps:
                    seen_pairs.add((m.id, om.id))
                    om_court_name = om.court.name if om.court else "another court"
                    conflicts.append(
                        f"{names.get(resource_id, resource_id)} ({resource_label}): game on {court.name} would run "
                        f"{new_start.strftime('%H:%M')}-{new_end.strftime('%H:%M')}, overlapping their "
                        f"game on {om_court_name} at {om.scheduled_start_time.strftime('%H:%M')}-"
                        f"{om.scheduled_end_time.strftime('%H:%M')} — they can't play both at once."
                    )

    if conflicts:
        raise HTTPException(
            status_code=409,
            detail="Can't move this court — it would double-book a player: " + " | ".join(conflicts),
        )

    for m in movable:
        m.scheduled_start_time = m.scheduled_start_time + delta
        m.scheduled_end_time = m.scheduled_end_time + delta
    db.flush()

    all_matches = (
        db.query(models.TeamTieGame).join(models.TeamTie)
        .filter(models.TeamTie.tournament_id == tournament_id).all()
        if is_team else
        db.query(models.Match).filter(models.Match.tournament_id == tournament_id).all()
    )
    all_courts = db.query(models.Court).filter(models.Court.tournament_id == tournament_id).all()
    tournament.schedule_summary = _derive_schedule_summary(all_matches, all_courts)
    db.commit()

    booking = None
    if tournament.schedule_summary:
        b = tournament.schedule_summary.get("court_bookings", {}).get(court_id)
        if b:
            booking = CourtBookingWindow(**b)

    return CourtRescheduleResponse(
        court_id=court_id,
        delta_minutes=int(delta.total_seconds() / 60),
        shifted_matches_count=len(movable),
        booking=booking,
    )
