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
    TournamentDetailsUpdate,
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
from app.services.fixture_engine.generators.team_friendly import TeamFriendlyGenerator, InfeasibleQuotaError
from app.services.match_progression import finalize_athlete_career_stats
from app.services.team_competition import complete_team_tie
from app.services.team_progression import finalize_team_tie
from app.services.scheduling_engine.cp_sat_solver import CourtScheduler

router = APIRouter(prefix="/tournaments", tags=["Tournaments"])

# Real courts are booked in fixed slots, not at an arbitrary minute — every generated match
# start, and every court booking window, is aligned to this grid (see CourtScheduler).
TIME_GRID_MINUTES = 30


def _round_datetime_up_to_grid(dt: datetime, grid_minutes: int = TIME_GRID_MINUTES) -> datetime:
    dt = dt.replace(second=0, microsecond=0)
    remainder = dt.minute % grid_minutes
    return dt if remainder == 0 else dt + timedelta(minutes=grid_minutes - remainder)


def _round_datetime_down_to_grid(dt: datetime, grid_minutes: int = TIME_GRID_MINUTES) -> datetime:
    dt = dt.replace(second=0, microsecond=0)
    remainder = dt.minute % grid_minutes
    return dt if remainder == 0 else dt - timedelta(minutes=remainder)


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

    court_bookings = {}
    overall_start = None
    overall_end = None
    total_billable_hours = 0.0

    for court_id, court_matches in by_court.items():
        # Matches pack back-to-back at whatever cadence the format needs, so the first start
        # and last end rarely land on a clean slot boundary — round the booking window OUT
        # (never in) to the slots an organiser would actually reserve.
        first_match_start = min(m.scheduled_start_time for m in court_matches)
        last_match_end = max(m.scheduled_end_time for m in court_matches)
        booked_from = _round_datetime_down_to_grid(first_match_start)
        booked_until = _round_datetime_up_to_grid(last_match_end)
        duration_minutes = int((booked_until - booked_from).total_seconds() / 60)
        billed_hours = duration_minutes / 60.0
        court_cost = billed_hours * avg_court_rate
        total_billable_hours += billed_hours

        # Keyed by court ID, not name — a court can be renamed at any time, and this key must
        # keep resolving on the frontend regardless (see CourtBookingsSection / ScheduleSummaryTab).
        court_bookings[court_id] = {
            "booked_from": booked_from.isoformat(),
            "booked_until": booked_until.isoformat(),
            "duration_minutes": duration_minutes,
            "billed_hours": billed_hours,
            "court_cost": court_cost,
        }

        overall_start = first_match_start if overall_start is None else min(overall_start, first_match_start)
        overall_end = last_match_end if overall_end is None else max(overall_end, last_match_end)

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
        tournament_type=payload.tournament_type,
        format=payload.format,
        event_formats={key: value.value for key, value in (payload.event_formats or {}).items()} or None,
        team_config=payload.team_config.model_dump(mode="json") if payload.team_config else None,
        category=payload.category,
        match_duration_minutes=payload.match_duration_minutes,
        rest_time_minutes=payload.rest_time_minutes,
        shuttle_cost=payload.shuttle_cost,
        shuttle_matches_per_unit=payload.shuttle_matches_per_unit,
        venue=payload.venue,
        venue_link=payload.venue_link,
        tournament_date=payload.tournament_date,
        registration_status=payload.registration_status,
        max_players=payload.max_players,
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
    """Lists tournaments the current organiser owns, co-organises, or (legacy) are unowned."""
    co_organised_ids = db.query(models.TournamentCoOrganiser.tournament_id).filter(
        models.TournamentCoOrganiser.organiser_id == current_user.id
    )
    return db.query(models.Tournament).filter(
        (models.Tournament.organiser_id == current_user.id)
        | (models.Tournament.organiser_id.is_(None))
        | (models.Tournament.id.in_(co_organised_ids))
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
    # Also self-heals a summary stored before court_bookings was keyed by court ID (it used to
    # be keyed by name, which went stale the moment a court was renamed).
    stored_bookings = (tournament.schedule_summary or {}).get("court_bookings") or {}
    court_ids = {c.id for c in tournament.courts}
    is_stale = stored_bookings and not (set(stored_bookings) & court_ids)
    if tournament.schedule_summary is None or is_stale:
        scheduled_rows = tournament.matches or [game for tie in tournament.team_ties for game in tie.games]
        derived = _derive_schedule_summary(scheduled_rows, tournament.courts)
        if derived:
            tournament.schedule_summary = derived

    if current_user.role == models.UserRole.OPERATOR:
        response = TournamentDetailResponse.model_validate(tournament).model_dump()
        for tie in response["team_ties"]:
            stored_tie = next((row for row in tournament.team_ties if row.id == tie["id"]), None)
            tie_started = any(game.actual_start_time for game in stored_tie.games) if stored_tie else False
            if not tie_started:
                for game in tie["games"]:
                    game["team1_player_ids"] = None
                    game["team2_player_ids"] = None
        return response
    return tournament


@router.patch("/{tournament_id}", response_model=TournamentResponse)
def update_tournament_details(
    tournament_id: str,
    payload: TournamentDetailsUpdate,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """
    Edits venue/date/registration settings — pure logistics, so allowed at any status, including
    after a schedule is generated or the event has started. Note: this doesn't touch already-
    persisted match times, which were fixed to whatever start time was given when the schedule
    was generated.
    """
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    if payload.venue is not None:
        tournament.venue = payload.venue
    if payload.venue_link is not None:
        # An empty string clears a previously-set link rather than being stored as-is.
        tournament.venue_link = payload.venue_link or None
    if payload.tournament_date is not None:
        tournament.tournament_date = payload.tournament_date
    if payload.registration_status is not None:
        tournament.registration_status = payload.registration_status
    if payload.max_players is not None:
        tournament.max_players = payload.max_players

    db.commit()
    db.refresh(tournament)
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
    num_qualifiers: int = 4,
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

    # Build a normal seeded bracket, capped at the available team count.
    qualified = [
        EnginePlayer(id=f"TBD_Seed{i}", name=f"TBD Seed {i}", seed=i)
        for i in range(1, min(num_qualifiers, num_players) + 1)
    ]
    template_matches.extend(_build_knockout_template_matches(qualified, engine))

    return template_matches


def _build_knockout_template_matches(
    entrants: List[EnginePlayer], engine: FixtureEngine,
) -> List[EngineMatch]:
    """Builds every knockout round using the shared bracket generator."""
    template: List[EngineMatch] = []
    current = entrants
    round_num = 1
    while len(current) > 1:
        generated = engine.generate_knockout_stage(current)
        next_round = []
        for match_index, match in enumerate(generated, start=1):
            match.round_num = round_num
            match.id = f"KO_R{round_num}_M{match_index}"
            if match.is_bye:
                next_round.append(EnginePlayer(
                    id=match.player1_id, name=match.player1_id, seed=len(next_round) + 1,
                ))
                continue
            template.append(match)
            winner_slot = f"TBD_R{round_num}_M{match_index}_Win"
            next_round.append(EnginePlayer(id=winner_slot, name=winner_slot, seed=len(next_round) + 1))
        current = next_round
        round_num += 1
    return template


def _build_team_template_matches(
    tournament: models.Tournament,
    teams: List[models.TournamentTeam],
    num_groups: int,
    num_swiss_rounds: Optional[int],
) -> List[EngineMatch]:
    if len(teams) < 2:
        raise HTTPException(status_code=400, detail="At least 2 teams are required to schedule a team tournament.")
    if any(team.seed is None for team in teams):
        raise HTTPException(status_code=400, detail="Assign a seed to every team before generating fixtures.")
    if len({team.seed for team in teams}) != len(teams):
        raise HTTPException(status_code=400, detail="Team seeds must be unique.")
    engine_teams = [EnginePlayer(id=team.id, name=team.name, seed=team.seed or 999) for team in teams]
    engine = FixtureEngine()

    if tournament.format == models.TournamentFormat.GROUP_KNOCKOUT:
        if num_groups < 1 or num_groups * 2 > len(teams):
            raise HTTPException(status_code=400, detail="Each group needs at least 2 teams.")
        return _build_group_template_matches(engine_teams, num_groups, engine)
    if tournament.format == models.TournamentFormat.SWISS_KNOCKOUT:
        rounds = num_swiss_rounds or default_swiss_rounds(len(teams))
        if rounds > len(teams) - 1:
            raise HTTPException(status_code=400, detail="Teams can play at most team_count - 1 Swiss rounds.")
        return _build_swiss_template_matches(
            engine_teams, engine, num_swiss_rounds=rounds, num_qualifiers=min(4, len(teams)),
        )
    if tournament.format == models.TournamentFormat.KNOCKOUT:
        return _build_knockout_template_matches(engine_teams, engine)
    raise HTTPException(status_code=400, detail="Unsupported team tournament format.")


def _generate_team_schedule(
    tournament: models.Tournament,
    payload: ScheduleGenerationRequest,
    courts: List[models.Court],
    db: Session,
) -> ScheduleGenerationResponse:
    teams = db.query(models.TournamentTeam).filter(
        models.TournamentTeam.tournament_id == tournament.id,
    ).order_by(models.TournamentTeam.seed.asc().nullslast()).all()
    config = tournament.team_config or {}
    order = config.get("match_order", [])
    if not order:
        raise HTTPException(status_code=400, detail="Configure the game order for each team tie first.")
    for team in teams:
        active_players = [p for p in team.players if not p.is_placeholder and not p.is_withdrawn]
        if not team.captain_player_id or team.captain_player_id not in {p.id for p in active_players}:
            raise HTTPException(status_code=400, detail=f"Assign an active captain to {team.name}.")
        required_singles = (config.get("singles_matches", 0) + config.get("max_singles_per_player", 0) - 1) // max(config.get("max_singles_per_player", 0), 1)
        required_doubles = (config.get("doubles_matches", 0) * 2 + config.get("max_doubles_per_player", 0) - 1) // max(config.get("max_doubles_per_player", 0), 1)
        required_mixed_doubles = (config.get("mixed_doubles_matches", 0) * 2 + config.get("max_mixed_doubles_per_player", 0) - 1) // max(config.get("max_mixed_doubles_per_player", 0), 1)
        required = max(required_singles, required_doubles, required_mixed_doubles)
        if len(active_players) < required:
            raise HTTPException(status_code=400, detail=f"{team.name} needs at least {required} active players for its tie settings.")

    fixtures = _build_team_template_matches(
        tournament, teams, payload.num_groups or 2, payload.num_swiss_rounds,
    )
    if not fixtures:
        raise HTTPException(status_code=400, detail="No team fixtures could be generated.")

    db.query(models.TeamTieGame).filter(
        models.TeamTieGame.tie_id.in_(
            db.query(models.TeamTie.id).filter(models.TeamTie.tournament_id == tournament.id)
        )
    ).delete(synchronize_session=False)
    db.query(models.TeamTie).filter(models.TeamTie.tournament_id == tournament.id).delete(synchronize_session=False)
    db.query(models.Match).filter(models.Match.tournament_id == tournament.id).delete(synchronize_session=False)
    db.flush()

    start_time = _round_datetime_down_to_grid(payload.start_time)
    avg_court_rate = sum(c.hourly_rate for c in courts) / len(courts)
    court_available_from = {
        idx + 1: court.available_from_minutes
        for idx, court in enumerate(courts) if court.available_from_minutes
    }
    tie_by_fixture = {}
    schedule_games = []
    precedence = []
    parallel_match_pairs = []
    play_all = config.get("completion_mode", "MAJORITY") == "PLAY_ALL"
    for fixture in fixtures:
        tie_id = f"{tournament.id}_{fixture.id}"
        team1_id = fixture.player1_id
        team2_id = fixture.player2_id
        tie = models.TeamTie(
            id=tie_id, tournament_id=tournament.id,
            stage=models.MatchStage(fixture.stage.value), round_num=fixture.round_num,
            group_id=fixture.group_id,
            team1_id=team1_id, team2_id=team2_id,
            winner_team_id=team1_id if fixture.is_bye else None,
            is_completed=fixture.is_bye,
        )
        tie_by_fixture[fixture.id] = tie
        db.add(tie)
        if fixture.is_bye:
            continue
        previous_game_id = None
        tie_game_ids = []
        for order_num, match_type in enumerate(order, start=1):
            game_id = f"{tie_id}_G{order_num}"
            schedule_games.append(EngineMatch(
                id=game_id, round_num=fixture.round_num,
                stage=EngineMatchStage(fixture.stage.value),
                group_id=fixture.group_id, player1_id=team1_id, player2_id=team2_id,
            ))
            if play_all:
                parallel_match_pairs.extend((previous_id, game_id) for previous_id in tie_game_ids)
            elif previous_game_id:
                precedence.append((previous_game_id, game_id))
            previous_game_id = game_id
            tie_game_ids.append(game_id)

    solver_result = CourtScheduler.schedule_matches(
        matches=schedule_games,
        num_courts=len(courts),
        match_duration=tournament.match_duration_minutes,
        rest_time=tournament.rest_time_minutes,
        court_hourly_cost=avg_court_rate,
        time_grid_minutes=TIME_GRID_MINUTES,
        court_available_from=court_available_from,
        match_precedence=precedence,
        allow_overlap_pairs=parallel_match_pairs,
    )
    if solver_result["status"] not in ("OPTIMAL", "FEASIBLE"):
        raise HTTPException(status_code=422, detail=f"Court scheduler could not find a feasible schedule: {solver_result['status']}")

    schedule_lookup = {item["match_id"]: item for item in solver_result["schedule"]}
    court_index_map = {f"Court_{idx + 1}": court.id for idx, court in enumerate(courts)}
    for fixture in fixtures:
        tie = tie_by_fixture[fixture.id]
        db.add(tie)
        if fixture.is_bye:
            continue
        tie_id = tie.id
        for order_num, match_type in enumerate(order, start=1):
            game_id = f"{tie_id}_G{order_num}"
            scheduled = schedule_lookup.get(game_id)
            game = models.TeamTieGame(
                id=game_id, tie=tie, order_num=order_num, match_type=match_type,
            )
            if scheduled:
                game.court_id = court_index_map[scheduled["court_id"]]
                game.scheduled_start_time = start_time + timedelta(minutes=scheduled["start_minute"])
                game.scheduled_end_time = start_time + timedelta(minutes=scheduled["end_minute"])
            db.add(game)

    for tie in tie_by_fixture.values():
        if tie.is_completed and tie.stage == models.MatchStage.KNOCKOUT:
            finalize_team_tie(tie, db)
    tournament.schedule_summary = {
        "generated_at": datetime.utcnow().isoformat(),
        "makespan_minutes": solver_result["makespan_minutes"],
        "total_billable_hours": solver_result["total_billable_hours"],
        "total_estimated_cost": solver_result["total_cost"],
        "flat_booking_cost": math.ceil(solver_result["makespan_minutes"] / TIME_GRID_MINUTES) * (TIME_GRID_MINUTES / 60) * len(courts) * avg_court_rate,
        "savings": max(
            math.ceil(solver_result["makespan_minutes"] / TIME_GRID_MINUTES) * (TIME_GRID_MINUTES / 60) * len(courts) * avg_court_rate - solver_result["total_cost"],
            0.0,
        ),
        "court_bookings": {
            court_index_map[name]: {
                "booked_from": (start_time + timedelta(minutes=window["booked_from_minute"])).isoformat(),
                "booked_until": (start_time + timedelta(minutes=window["booked_until_minute"])).isoformat(),
                "duration_minutes": window["duration_minutes"],
                "billed_hours": window["billed_hours"],
                "court_cost": window["court_cost"],
            }
            for name, window in solver_result["court_bookings"].items()
        },
    }
    tournament.status = models.TournamentStatus.SCHEDULING
    db.commit()
    response_bookings = {
        court_id: CourtBookingWindow(
            booked_from=datetime.fromisoformat(item["booked_from"]),
            booked_until=datetime.fromisoformat(item["booked_until"]),
            duration_minutes=item["duration_minutes"], billed_hours=item["billed_hours"],
            court_cost=item["court_cost"],
        )
        for court_id, item in tournament.schedule_summary["court_bookings"].items()
    }
    return ScheduleGenerationResponse(
        tournament_id=tournament.id, status=solver_result["status"],
        makespan_minutes=solver_result["makespan_minutes"],
        total_billable_hours=solver_result["total_billable_hours"],
        total_estimated_cost=solver_result["total_cost"],
        flat_booking_cost=tournament.schedule_summary["flat_booking_cost"],
        savings=tournament.schedule_summary["savings"],
        court_bookings=response_bookings,
        scheduled_matches_count=len(solver_result["schedule"]),
    )


def _build_team_friendly_template_matches(
    real_db_players: List[models.Player],
    matches_per_player: Optional[int],
) -> List[EngineMatch]:
    """
    Validates the roster is ready for the TEAM_FRIENDLY format and generates the cross-team
    singles schedule. Every player plays the SAME number of matches (one tournament-wide number,
    not set per player) — since each match contributes one opponent to a player on each side, a
    uniform count is only realizable when both teams are the same size, so that's enforced here
    too rather than left for the solver to reject opaquely.
    Raises HTTPException(400) with a message naming the problem, so the organiser gets a clear
    fix-it instruction rather than a solver error.
    """
    if not matches_per_player or matches_per_player < 1:
        raise HTTPException(status_code=400, detail="Set how many matches each player should play.")

    missing_team = [p.name for p in real_db_players if p.team not in ("A", "B")]
    if missing_team:
        raise HTTPException(
            status_code=400,
            detail=f"Assign a team (A or B) to every player first. Missing: {', '.join(missing_team)}"
        )

    team_a_db = [p for p in real_db_players if p.team == "A"]
    team_b_db = [p for p in real_db_players if p.team == "B"]
    if len(team_a_db) < 2 or len(team_b_db) < 2:
        raise HTTPException(
            status_code=400,
            detail="Each team needs at least 2 players for a cross-team friendly schedule."
        )
    if len(team_a_db) != len(team_b_db):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Teams must be the same size for everyone to play an equal number of matches — "
                f"Team A has {len(team_a_db)} players, Team B has {len(team_b_db)}."
            )
        )
    if matches_per_player > len(team_b_db):
        raise HTTPException(
            status_code=400,
            detail=(
                f"{matches_per_player} matches per player isn't possible with {len(team_b_db)} "
                "players on the other team — opponents can't repeat."
            )
        )

    team_a = [EnginePlayer(id=p.id, name=p.name, seed=p.seed or 1) for p in team_a_db]
    team_b = [EnginePlayer(id=p.id, name=p.name, seed=p.seed or 1) for p in team_b_db]
    quotas = {p.id: matches_per_player for p in real_db_players}

    try:
        return TeamFriendlyGenerator.generate_crossover_matches(team_a, team_b, quotas)
    except InfeasibleQuotaError as e:
        raise HTTPException(status_code=400, detail=e.detail)


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

    if tournament.event_formats:
        raise HTTPException(
            status_code=400,
            detail="Combined singles and doubles event fixture generation is not available yet.",
        )

    # Regeneration wipes every match below, so it's only safe before real play has begun.
    # DRAFT = first-ever generation; SCHEDULING = a schedule already exists but nothing's
    # started, so re-running it (after a withdrawal / roster change) just rebuilds from scratch.
    if tournament.status not in (models.TournamentStatus.DRAFT, models.TournamentStatus.SCHEDULING):
        raise HTTPException(
            status_code=400,
            detail="Cannot regenerate the schedule after the tournament has started or finished."
        )

    # Belt-and-braces: even in SCHEDULING, refuse if a real operator-submitted score has
    # somehow already been recorded — regenerating would silently erase it. Byes and
    # withdrawal walkovers are auto-resolved bookkeeping, not played results, so they're
    # fine to wipe — in fact a withdrawal walkover is exactly what regeneration is for.
    has_recorded_result = db.query(models.Match).filter(
        models.Match.tournament_id == tournament_id,
        models.Match.is_completed == True,
        models.Match.is_bye == False,
        models.Match.is_walkover == False,
    ).first()
    has_recorded_team_game = db.query(models.TeamTieGame).join(models.TeamTie).filter(
        models.TeamTie.tournament_id == tournament_id,
        models.TeamTieGame.is_completed == True,
        models.TeamTieGame.is_skipped == False,
    ).first()
    if has_recorded_result or has_recorded_team_game:
        raise HTTPException(
            status_code=400,
            detail="Cannot regenerate — at least one match already has a recorded result, which would be lost."
        )

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

    if tournament.tournament_type == models.TournamentType.TEAM:
        return _generate_team_schedule(tournament, payload, courts, db)

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
    elif tournament.format == models.TournamentFormat.KNOCKOUT:
        template_matches = _build_knockout_template_matches(engine_players, engine)
    elif tournament.format == models.TournamentFormat.TEAM_FRIENDLY:
        # No seed is threaded through from the payload — leaving it unset lets the generator's
        # RNG draw fresh randomness each call, so "Regenerate schedule" naturally produces a
        # different valid draw every time without needing a new request field for this format.
        template_matches = _build_team_friendly_template_matches(
            real_db_players=real_players,
            matches_per_player=payload.matches_per_player,
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported tournament format")

    # 2. Run CP-SAT Court Optimization
    # Anchor to a grid boundary: each court's booking window is floored/ceiled to the grid
    # relative to this start time, so if the start time itself is off-grid (e.g. an organiser
    # picks 9:07), the very first court window would too. Rounding down never costs real time,
    # since nothing was scheduled before the first match anyway.
    start_time = _round_datetime_down_to_grid(payload.start_time)
    avg_court_rate = sum(c.hourly_rate for c in courts) / len(courts) if courts else 40.0
    # Index 1..N in the same order courts are enumerated everywhere else in this function (see
    # court_index_map below) — a court with no delay configured is omitted and defaults to 0
    # inside the solver, same as before staggered availability existed.
    court_available_from = {
        idx + 1: c.available_from_minutes for idx, c in enumerate(courts) if c.available_from_minutes
    }
    solver_result = CourtScheduler.schedule_matches(
        matches=template_matches,
        num_courts=len(courts),
        match_duration=tournament.match_duration_minutes,
        rest_time=tournament.rest_time_minutes,
        court_hourly_cost=avg_court_rate,
        time_grid_minutes=TIME_GRID_MINUTES,
        court_available_from=court_available_from,
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
            db_match.scheduled_start_time = start_time + timedelta(minutes=sched_item["start_minute"])
            db_match.scheduled_end_time = start_time + timedelta(minutes=sched_item["end_minute"])
            persisted_matches_count += 1

        db.add(db_match)

    # 7. Structure court booking windows for the API response. Keyed by court ID, not name —
    # a court can be renamed at any time after this, and that key must keep resolving on the
    # frontend regardless (see CourtBookingsSection / ScheduleSummaryTab).
    response_bookings = {}
    for court_key, b_info in solver_result["court_bookings"].items():
        db_court_id = court_index_map.get(court_key, court_key)

        response_bookings[db_court_id] = CourtBookingWindow(
            booked_from=start_time + timedelta(minutes=b_info["booked_from_minute"]),
            booked_until=start_time + timedelta(minutes=b_info["booked_until_minute"]),
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

    # Byes and walkovers are already marked is_completed at creation/resolution time, so this
    # only blocks on matches — including the final — that genuinely haven't been played yet.
    incomplete_match = db.query(models.Match).filter(
        models.Match.tournament_id == tournament_id,
        models.Match.is_completed == False,
    ).first()
    incomplete_team_tie = db.query(models.TeamTie).filter(
        models.TeamTie.tournament_id == tournament_id,
        models.TeamTie.is_completed == False,
    ).first()
    if incomplete_match or incomplete_team_tie:
        raise HTTPException(
            status_code=400,
            detail="Cannot end the tournament — some matches or team ties haven't been completed yet."
        )

    tournament.status = models.TournamentStatus.COMPLETED
    if tournament.tournament_type == models.TournamentType.INDIVIDUAL:
        finalize_athlete_career_stats(tournament_id, db)
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

    # Allowed through SCHEDULING too — this only rewrites Player.seed, it doesn't touch matches,
    # so it's safe to re-run after adding/withdrawing players, right before regenerating the
    # schedule to pick up the new seed order.
    if tournament.status not in (models.TournamentStatus.DRAFT, models.TournamentStatus.SCHEDULING):
        raise HTTPException(status_code=400, detail="Cannot alter seeding after the tournament has started or finished.")

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
