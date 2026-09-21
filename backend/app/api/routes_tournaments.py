import math
import uuid
import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import CurrentUser, ensure_tournament_access, get_db, require_operator_or_organiser, require_organiser
from app.db import models
from app.schemas.tournament import (
    TournamentCreate,
    TournamentResponse,
    TournamentDetailResponse,
    ScheduleGenerationRequest,
    ScheduleGenerationResponse,
    CourtBookingWindow,
)
from app.services.fixture_engine.datatypes import (
    Player as EnginePlayer,
    Match as EngineMatch,
    MatchStage as EngineMatchStage,
)
from app.services.fixture_engine.fixture_engine import FixtureEngine
from app.services.scheduling_engine.cp_sat_solver import CourtScheduler

router = APIRouter(prefix="/tournaments", tags=["Tournaments"])


def _derive_schedule_summary(matches: List[models.Match], courts: List[models.Court]) -> Optional[dict]:
    """
    Reconstructs a cost/savings summary from persisted match times, for tournaments
    scheduled before schedule_summary existed (or if it's ever missing/stale).
    Mirrors the CP-SAT route's own math: booked window = first-match-start to
    last-match-end per court, billed in 30-minute increments at the average court rate.
    """
    if not courts:
        return None

    scheduled = [m for m in matches if m.court_id and m.scheduled_start_time and m.scheduled_end_time]
    if not scheduled:
        return None

    by_court: Dict[str, List[models.Match]] = {}
    for m in scheduled:
        by_court.setdefault(m.court_id, []).append(m)

    avg_court_rate = sum(c.hourly_rate for c in courts) / len(courts)
    court_name_map = {c.id: c.name for c in courts}

    court_bookings = {}
    overall_start = None
    overall_end = None
    total_billable_hours = 0.0

    for court_id, court_matches in by_court.items():
        booked_from = min(m.scheduled_start_time for m in court_matches)
        booked_until = max(m.scheduled_end_time for m in court_matches)
        duration_minutes = int((booked_until - booked_from).total_seconds() / 60)
        billed_hours = math.ceil(duration_minutes / 30) * 0.5
        court_cost = billed_hours * avg_court_rate
        total_billable_hours += billed_hours

        court_bookings[court_name_map.get(court_id, court_id)] = {
            "booked_from": booked_from.isoformat(),
            "booked_until": booked_until.isoformat(),
            "duration_minutes": duration_minutes,
            "billed_hours": billed_hours,
            "court_cost": court_cost,
        }

        overall_start = booked_from if overall_start is None else min(overall_start, booked_from)
        overall_end = booked_until if overall_end is None else max(overall_end, booked_until)

    makespan_minutes = int((overall_end - overall_start).total_seconds() / 60)
    total_estimated_cost = total_billable_hours * avg_court_rate
    flat_hours_per_court = math.ceil(makespan_minutes / 30) * 0.5
    flat_booking_cost = flat_hours_per_court * len(courts) * avg_court_rate
    savings = max(flat_booking_cost - total_estimated_cost, 0.0)

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "makespan_minutes": makespan_minutes,
        "total_billable_hours": total_billable_hours,
        "total_estimated_cost": total_estimated_cost,
        "flat_booking_cost": flat_booking_cost,
        "savings": savings,
        "court_bookings": court_bookings,
    }


# =====================================================================
# TOURNAMENT CRUD
# =====================================================================
@router.post("", response_model=TournamentDetailResponse, status_code=status.HTTP_201_CREATED)
def create_tournament(
    payload: TournamentCreate,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """Creates a tournament along with its physical court assets."""
    tournament = models.Tournament(
        id=f"TOURN_{uuid.uuid4().hex[:8]}",
        name=payload.name,
        format=payload.format,
        category=payload.category,
        match_duration_minutes=payload.match_duration_minutes,
        rest_time_minutes=payload.rest_time_minutes,
        shuttle_cost=payload.shuttle_cost,
        shuttle_matches_per_unit=payload.shuttle_matches_per_unit,
        venue=payload.venue,
        tournament_date=payload.tournament_date,
        status=models.TournamentStatus.DRAFT,
        organiser_id=current_user.id,
    )
    db.add(tournament)
    db.flush()

    # Create associated courts
    for idx, court_in in enumerate(payload.courts, start=1):
        court = models.Court(
            id=f"CRT_{uuid.uuid4().hex[:8]}",
            tournament_id=tournament.id,
            name=court_in.name or f"Court {idx}",
            hourly_rate=court_in.hourly_rate,
        )
        db.add(court)

    db.commit()
    db.refresh(tournament)
    return tournament


@router.get("", response_model=List[TournamentResponse])
def list_tournaments(
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """Lists tournaments owned by the current organiser (plus legacy, unowned tournaments)."""
    return db.query(models.Tournament).filter(
        (models.Tournament.organiser_id == current_user.id) | (models.Tournament.organiser_id.is_(None))
    ).order_by(models.Tournament.created_at.desc()).all()


@router.get("/{tournament_id}", response_model=TournamentDetailResponse)
def get_tournament(
    tournament_id: str,
    current_user: CurrentUser = Depends(require_operator_or_organiser),
    db: Session = Depends(get_db),
):
    """Fetches comprehensive details of a tournament (courts, players, scheduled matches)."""
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    # Tournaments scheduled before cost tracking was added have no stored schedule_summary.
    # Derive one from the persisted match times so the cost/savings figures still show up.
    if tournament.schedule_summary is None:
        derived = _derive_schedule_summary(tournament.matches, tournament.courts)
        if derived:
            tournament.schedule_summary = derived

    return tournament


# =====================================================================
# CP-SAT SCHEDULE GENERATION
# =====================================================================
def _build_group_template_matches(
    engine_players: List[EnginePlayer],
    num_groups: int,
    engine: FixtureEngine
) -> List[EngineMatch]:
    """Generates all group matches followed by a full dynamic knockout bracket with TBDs."""
    template_matches: List[EngineMatch] = []

    # 1. Group Stage Fixtures
    group_fixtures = engine.setup_group_stage(engine_players, num_groups=num_groups)
    for pool_matches in group_fixtures.values():
        template_matches.extend(pool_matches)

    # 2. Dynamic Knockout Stages (Top 2 from each pool advance)
    num_advancing = num_groups * 2
    current_field = [
        EnginePlayer(id=f"TBD_Seed_{i}", name=f"TBD Seed {i}", seed=i)
        for i in range(1, num_advancing + 1)
    ]

    round_num = 1
    while len(current_field) > 1:
        ko_matches = engine.generate_knockout_stage(current_field)
        next_round_players = []
        match_idx = 1

        for m in ko_matches:
            m.round_num = round_num

            if m.is_bye:
                advancing_id = m.player1_id
                next_round_players.append(
                    EnginePlayer(id=advancing_id, name=advancing_id, seed=len(next_round_players) + 1)
                )
            else:
                m.id = f"KO_R{round_num}_M{match_idx}"
                template_matches.append(m)

                winner_placeholder = f"TBD_R{round_num}_M{match_idx}_Win"
                next_round_players.append(
                    EnginePlayer(id=winner_placeholder, name=winner_placeholder, seed=len(next_round_players) + 1)
                )
                match_idx += 1

        current_field = next_round_players
        round_num += 1

    return template_matches


def default_swiss_rounds(num_players: int) -> int:
    padded = num_players + (num_players % 2)
    return max(1, math.ceil(math.log2(padded)))


def _build_swiss_template_matches(
    engine_players: List[EnginePlayer],
    engine: FixtureEngine,
    num_swiss_rounds: Optional[int] = None,
) -> List[EngineMatch]:
    """Generates Swiss rounds with real R1 and TBD subsequent rounds + Top 4 Knockouts."""
    template_matches: List[EngineMatch] = []
    num_players = len(engine_players)
    num_swiss_rounds = num_swiss_rounds or default_swiss_rounds(num_players)
    playable_per_round = num_players // 2
    has_bye = num_players % 2 == 1

    # Swiss Round 1 (Real pairings)
    r1_matches = engine.generate_swiss_round(engine_players, round_num=1)
    template_matches.extend(r1_matches)

    # Swiss Rounds 2..N (TBD placeholders). With an odd field, the round's bye gets its own
    # unscheduled slot (player2 = None) so it never occupies a court time slot.
    for r in range(2, num_swiss_rounds + 1):
        for m_idx in range(1, playable_per_round + 1):
            template_matches.append(EngineMatch(
                id=f"SWISS_R{r}_M{m_idx}",
                round_num=r,
                stage=EngineMatchStage.SWISS,
                player1_id=f"TBD_R{r}_{m_idx}A",
                player2_id=f"TBD_R{r}_{m_idx}B"
            ))
        if has_bye:
            template_matches.append(EngineMatch(
                id=f"SWISS_R{r}_BYE",
                round_num=r,
                stage=EngineMatchStage.SWISS,
                player1_id=f"TBD_R{r}_BYE",
                player2_id=None
            ))

    # Knockout Semifinals & Finals (Top 4)
    template_matches.extend([
        EngineMatch(id="KO_R1_M1", round_num=1, stage=EngineMatchStage.KNOCKOUT, player1_id="TBD_Seed1", player2_id="TBD_Seed4"),
        EngineMatch(id="KO_R1_M2", round_num=1, stage=EngineMatchStage.KNOCKOUT, player1_id="TBD_Seed2", player2_id="TBD_Seed3"),
        EngineMatch(id="KO_R2_M1", round_num=2, stage=EngineMatchStage.KNOCKOUT, player1_id="TBD_SF1_Win", player2_id="TBD_SF2_Win"),
    ])

    return template_matches


@router.post("/{tournament_id}/generate-schedule", response_model=ScheduleGenerationResponse)
def generate_tournament_schedule(
    tournament_id: str,
    payload: ScheduleGenerationRequest,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db)
):
    """
    Executes the Fixture Engine and CP-SAT Solver to generate a cost-optimized court schedule.
    Persists placeholders, court slots, and matches into PostgreSQL.
    """
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    real_players = db.query(models.Player).filter(
        models.Player.tournament_id == tournament_id,
        models.Player.is_placeholder == False,
        models.Player.is_withdrawn == False
    ).order_by(models.Player.seed.asc().nullslast()).all()

    if len(real_players) < 2:
        raise HTTPException(status_code=400, detail="At least 2 players are required to schedule a tournament.")

    courts = db.query(models.Court).filter(models.Court.tournament_id == tournament_id).all()
    if not courts:
        raise HTTPException(status_code=400, detail="At least 1 court must be configured for this tournament.")

    # Convert DB players to Engine dataclass format
    engine_players = [
        EnginePlayer(id=p.id, name=p.name, seed=p.seed or (idx + 1))
        for idx, p in enumerate(real_players)
    ]

    engine = FixtureEngine()

    # 1. Generate format-specific template fixtures
    if tournament.format == models.TournamentFormat.GROUP_KNOCKOUT:
        template_matches = _build_group_template_matches(
            engine_players=engine_players,
            num_groups=payload.num_groups or 2,
            engine=engine
        )
    elif tournament.format == models.TournamentFormat.SWISS_KNOCKOUT:
        max_rounds = len(engine_players) - 1
        if payload.num_swiss_rounds and payload.num_swiss_rounds > max_rounds:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{len(engine_players)} players can play at most {max_rounds} Swiss rounds "
                    "without repeating an opponent."
                )
            )
        template_matches = _build_swiss_template_matches(
            engine_players=engine_players,
            engine=engine,
            num_swiss_rounds=payload.num_swiss_rounds
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported tournament format")

    # 2. Run CP-SAT Court Optimization
    avg_court_rate = sum(c.hourly_rate for c in courts) / len(courts) if courts else 40.0
    solver_result = CourtScheduler.schedule_matches(
        matches=template_matches,
        num_courts=len(courts),
        match_duration=tournament.match_duration_minutes,
        rest_time=tournament.rest_time_minutes,
        court_hourly_cost=avg_court_rate
    )

    if solver_result["status"] not in ("OPTIMAL", "FEASIBLE"):
        raise HTTPException(
            status_code=422,
            detail=f"CP-SAT solver could not find a feasible schedule: {solver_result['status']}"
        )

    # 3. Clean up prior generated placeholder data if re-running
    db.query(models.Match).filter(models.Match.tournament_id == tournament_id).delete()
    db.query(models.Player).filter(
        models.Player.tournament_id == tournament_id,
        models.Player.is_placeholder == True
    ).delete()
    db.flush()

    # 4. Map Court 1..N index to Court database UUIDs
    court_index_map = {f"Court_{idx+1}": court.id for idx, court in enumerate(courts)}
    court_name_map = {court.id: court.name for court in courts}

    # Helper to namespace placeholder IDs to this tournament
    def scope_id(pid: Optional[str]) -> Optional[str]:
        if pid and pid.startswith("TBD") and not pid.startswith(f"{tournament.id}_"):
            return f"{tournament.id}_{pid}"
        return pid

    # 5. Extract and persist all TBD placeholder players
    created_placeholder_ids = set()
    for m in template_matches:
        for raw_pid in (m.player1_id, m.player2_id):
            if raw_pid and str(raw_pid).startswith("TBD"):
                scoped_pid = scope_id(raw_pid)
                if scoped_pid not in created_placeholder_ids:
                    created_placeholder_ids.add(scoped_pid)
                    # Check if already exists in DB to prevent re-insertion
                    existing = db.query(models.Player).filter(models.Player.id == scoped_pid).first()
                    if not existing:
                        db_placeholder = models.Player(
                            id=scoped_pid,
                            tournament_id=tournament.id,
                            name=raw_pid,  # Keep the original descriptive name
                            is_placeholder=True,
                            ranking_points_earned=0.0
                        )
                        db.add(db_placeholder)
    db.flush()

    # 6. Persist scheduled matches
    schedule_lookup = {item["match_id"]: item for item in solver_result["schedule"]}
    persisted_matches_count = 0

    for m in template_matches:
        sched_item = schedule_lookup.get(m.id)
        
        # Scope the match ID
        match_id = f"{tournament_id}_{m.id}" if not m.id.startswith(tournament_id) else m.id
        
        db_match = models.Match(
            id=match_id,
            tournament_id=tournament_id,
            stage=models.MatchStage(m.stage.value),
            round_num=m.round_num,
            group_id=m.group_id,
            player1_id=scope_id(m.player1_id),
            player2_id=scope_id(m.player2_id),
            is_completed=m.is_completed,
            is_bye=m.is_bye,
            status=models.MatchStatus.COMPLETED if m.is_completed else models.MatchStatus.SCHEDULED,
            winner_id=scope_id(m.winner_id) if m.is_bye else None,
        )

        if sched_item:
            court_idx_str = sched_item["court_id"]
            db_match.court_id = court_index_map.get(court_idx_str)
            db_match.scheduled_start_time = payload.start_time + timedelta(minutes=sched_item["start_minute"])
            db_match.scheduled_end_time = payload.start_time + timedelta(minutes=sched_item["end_minute"])
            persisted_matches_count += 1

        db.add(db_match)

    # 7. Structure court booking windows for the API response
    response_bookings = {}
    for court_key, b_info in solver_result["court_bookings"].items():
        db_court_id = court_index_map.get(court_key)
        display_name = court_name_map.get(db_court_id, court_key)

        response_bookings[display_name] = CourtBookingWindow(
            booked_from=payload.start_time + timedelta(minutes=b_info["booked_from_minute"]),
            booked_until=payload.start_time + timedelta(minutes=b_info["booked_until_minute"]),
            duration_minutes=b_info["duration_minutes"],
            billed_hours=b_info["billed_hours"],
            court_cost=b_info["court_cost"]
        )

    # 8. Cost comparison: the CP-SAT plan de-ramps courts as rounds finish, vs. the
    # naive baseline of renting every court for the full tournament makespan.
    flat_hours_per_court = math.ceil(solver_result["makespan_minutes"] / 30) * 0.5
    flat_booking_cost = flat_hours_per_court * len(courts) * avg_court_rate
    savings = max(flat_booking_cost - solver_result["total_cost"], 0.0)

    generated_at = datetime.utcnow()
    tournament.schedule_summary = {
        "generated_at": generated_at.isoformat(),
        "makespan_minutes": solver_result["makespan_minutes"],
        "total_billable_hours": solver_result["total_billable_hours"],
        "total_estimated_cost": solver_result["total_cost"],
        "flat_booking_cost": flat_booking_cost,
        "savings": savings,
        "court_bookings": {name: window.model_dump(mode="json") for name, window in response_bookings.items()},
    }

    # 9. Schedule is ready but play hasn't started yet — the organiser starts it explicitly.
    tournament.status = models.TournamentStatus.SCHEDULING
    db.commit()

    return ScheduleGenerationResponse(
        tournament_id=tournament_id,
        status=solver_result["status"],
        makespan_minutes=solver_result["makespan_minutes"],
        total_billable_hours=solver_result["total_billable_hours"],
        total_estimated_cost=solver_result["total_cost"],
        flat_booking_cost=flat_booking_cost,
        savings=savings,
        court_bookings=response_bookings,
        scheduled_matches_count=persisted_matches_count
    )

@router.delete("/{tournament_id}", status_code=status.HTTP_200_OK)
def delete_tournament(
    tournament_id: str,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db)
):
    """Permanently deletes a tournament with its players, courts, matches and operator invites."""
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    operator_ids = {a.operator_id for a in tournament.operator_assignments}

    db.delete(tournament)
    db.flush()

    # Operator accounts exist only to score one tournament's matches; drop the ones left with no invites.
    for operator_id in operator_ids:
        still_assigned = db.query(models.OperatorAssignment).filter(
            models.OperatorAssignment.operator_id == operator_id
        ).first()
        if not still_assigned:
            db.query(models.User).filter(
                models.User.id == operator_id, models.User.role == models.UserRole.OPERATOR
            ).delete(synchronize_session=False)

    db.commit()
    return {"message": "Tournament deleted.", "tournament_id": tournament_id}


@router.post("/{tournament_id}/start", response_model=TournamentResponse)
def start_tournament(
    tournament_id: str,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db)
):
    """Marks a scheduled tournament as live. Requires a schedule to already be generated."""
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    if tournament.status != models.TournamentStatus.SCHEDULING:
        raise HTTPException(
            status_code=400,
            detail="Generate a schedule before starting the tournament."
        )

    tournament.status = models.TournamentStatus.IN_PROGRESS
    db.commit()
    db.refresh(tournament)
    return tournament


@router.post("/{tournament_id}/end", response_model=TournamentResponse)
def end_tournament(
    tournament_id: str,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db)
):
    """Marks a live tournament as completed."""
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    if tournament.status != models.TournamentStatus.IN_PROGRESS:
        raise HTTPException(
            status_code=400,
            detail="Only a live tournament can be ended."
        )

    tournament.status = models.TournamentStatus.COMPLETED
    db.commit()
    db.refresh(tournament)
    return tournament


@router.post("/{tournament_id}/finalize-seeding", status_code=status.HTTP_200_OK)
def finalize_tournament_seeding(
    tournament_id: str,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """
    Automatically assigns seeds to all registered players.
    - Ranked players are ordered by their global ranking points.
    - Unranked (new) players are randomized and appended to the bottom.
    """
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    if tournament.status != models.TournamentStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Cannot alter seeding after scheduling has started.")

    # Fetch all real players (no placeholders, no withdrawals) with their athlete data attached
    players = db.query(models.Player).options(joinedload(models.Player.athlete)).filter(
        models.Player.tournament_id == tournament_id,
        models.Player.is_placeholder == False,
        models.Player.is_withdrawn == False
    ).all()

    if not players:
        raise HTTPException(status_code=400, detail="No players found in this tournament.")

    ranked_players = []
    unranked_players = []

    # Separate ranked from unranked
    for p in players:
        # Check athlete's global points, default to 0 if none
        points = p.athlete.ranking_points if p.athlete else 0.0
        
        if points > 0:
            # We also include matches_won as a tiebreaker
            tiebreaker = p.athlete.matches_won if p.athlete else 0
            ranked_players.append((points, tiebreaker, p))
        else:
            unranked_players.append(p)

    # Sort ranked players: Primary=points (DESC), Secondary=matches_won (DESC)
    ranked_players.sort(key=lambda x: (x[0], x[1]), reverse=True)

    # Shuffle unranked players randomly
    random.seed() # Use system time for randomness
    random.shuffle(unranked_players)

    # Apply seeds consecutively
    current_seed = 1
    
    # 1. Assign top seeds to ranked players
    for pts, tb, p in ranked_players:
        p.seed = current_seed
        current_seed += 1

    # 2. Assign remaining seeds to randomized unranked players
    for p in unranked_players:
        p.seed = current_seed
        current_seed += 1

    db.commit()

    return {
        "message": "Seeding finalized successfully.",
        "total_players": len(players),
        "ranked_players_seeded": len(ranked_players),
        "unranked_players_randomized": len(unranked_players)
    }