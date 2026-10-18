import csv
import io
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser, ensure_tournament_access, get_db, require_operator_or_organiser, require_organiser, require_player
from app.core.phone import normalize_indian_phone
from app.db import models
from app.schemas.player import (
    PlayerCreate,
    PlayerBatchCreate,
    PlayerResponse,
    PlayerUpdate,
    PlayerWithdrawRequest,
    PlayerWithdrawResponse,
    PlayerTeamAssignmentsUpdate,
    NextMatchResponse,
    TeamAssignmentBulkUpdate,
)
from app.services.match_progression import resolve_pending_walkovers
from app.services.round_labels import build_round_label_fn

router = APIRouter(prefix="/tournaments/{tournament_id}/players", tags=["Players"])


def _active_player_count(db: Session, tournament_id: str) -> int:
    return db.query(models.Player).filter(
        models.Player.tournament_id == tournament_id, models.Player.is_placeholder == False
    ).count()


def _auto_close_registration_if_full(db: Session, tournament: models.Tournament) -> None:
    """
    Flips registration to CLOSED the moment the roster cap is reached, regardless of which
    endpoint added the player that filled the last slot (self-register, a single organiser
    add, a batch add, or a roster file upload). Relies on SQLAlchemy's autoflush to count
    players just added in this same session before they're committed.
    """
    if tournament.max_players is None or tournament.registration_status == models.RegistrationStatus.CLOSED:
        return
    # The session here has autoflush off (see tests/conftest.py), so a just-added player
    # isn't visible to a query until explicitly flushed.
    db.flush()
    if _active_player_count(db, tournament.id) >= tournament.max_players:
        tournament.registration_status = models.RegistrationStatus.CLOSED


def _find_or_create_athlete(db: Session, name: str, email: Optional[str]) -> Optional[models.Athlete]:
    """Matches an existing global athlete by email, or creates one — same dedup the CSV roster
    upload does. Returns None when no email is given (the player just isn't linked globally)."""
    if not email:
        return None
    athlete = db.query(models.Athlete).filter(models.Athlete.email == email).first()
    if not athlete:
        athlete = models.Athlete(name=name, email=email)
        db.add(athlete)
        db.flush()
    return athlete


@router.post("", response_model=PlayerResponse, status_code=status.HTTP_201_CREATED)
def register_player(
    tournament_id: str,
    payload: PlayerCreate,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db)
):
    """Registers a single player into a tournament."""
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    # Allowed through SCHEDULING too (schedule already generated but not started) so a
    # late entrant can be added and the schedule regenerated to include them.
    if tournament.status not in (models.TournamentStatus.DRAFT, models.TournamentStatus.SCHEDULING):
        raise HTTPException(
            status_code=400,
            detail="Cannot add players once the tournament is in progress or completed."
        )

    if payload.team_id is not None:
        if tournament.tournament_type != models.TournamentType.TEAM:
            raise HTTPException(status_code=400, detail="Players can only be assigned to teams in team tournaments.")
        team_exists = db.query(models.TournamentTeam.id).filter(
            models.TournamentTeam.id == payload.team_id,
            models.TournamentTeam.tournament_id == tournament_id,
        ).first()
        if not team_exists:
            raise HTTPException(status_code=400, detail="Choose a team from this tournament.")

    athlete = _find_or_create_athlete(db, payload.name, payload.email)
    if athlete:
        existing_entry = db.query(models.Player).filter(
            models.Player.tournament_id == tournament_id,
            models.Player.athlete_id == athlete.id
        ).first()
        if existing_entry:
            raise HTTPException(status_code=400, detail="This player is already registered for this tournament.")

    player = models.Player(
        id=f"P_{uuid.uuid4().hex[:8]}",
        tournament_id=tournament_id,
        athlete_id=athlete.id if athlete else None,
        name=payload.name,
        seed=payload.seed,
        is_placeholder=payload.is_placeholder,
        team_id=payload.team_id,
    )
    db.add(player)
    if not player.is_placeholder:
        _auto_close_registration_if_full(db, tournament)
    db.commit()
    db.refresh(player)
    return player


@router.post("/self-register", response_model=PlayerResponse, status_code=status.HTTP_201_CREATED)
def self_register_player(
    tournament_id: str,
    current_user: CurrentUser = Depends(require_player),
    db: Session = Depends(get_db),
):
    """
    A logged-in, email-verified player joins a tournament's roster directly, using their own
    verified name/athlete link — never client-supplied values, so nobody can register under an
    identity that isn't theirs. Deliberately skips ensure_tournament_access: that gate encodes
    organiser/operator *ownership* of a tournament, which has no analogue here — any verified
    player may register for any tournament that's still open, the same visibility the public
    showcase (routes_public.py) already grants anonymously.
    """
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if tournament.tournament_type == models.TournamentType.TEAM:
        raise HTTPException(status_code=400, detail="Team tournament rosters are managed by the organiser.")

    if tournament.status not in (models.TournamentStatus.DRAFT, models.TournamentStatus.SCHEDULING):
        raise HTTPException(status_code=400, detail="Registration is closed for this tournament.")
    if tournament.registration_status != models.RegistrationStatus.OPEN:
        if tournament.registration_status == models.RegistrationStatus.NOT_OPEN:
            raise HTTPException(status_code=400, detail="Registration hasn't opened yet for this tournament.")
        is_full = tournament.max_players is not None and _active_player_count(db, tournament_id) >= tournament.max_players
        detail = "This tournament is full." if is_full else "Registration is closed for this tournament."
        raise HTTPException(status_code=400, detail=detail)

    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user.athlete_id:
        raise HTTPException(status_code=400, detail="Your account isn't linked to an athlete profile yet.")

    existing_entry = db.query(models.Player).filter(
        models.Player.tournament_id == tournament_id,
        models.Player.athlete_id == user.athlete_id,
    ).first()
    if existing_entry:
        raise HTTPException(status_code=400, detail="You're already registered for this tournament.")

    if tournament.max_players is not None and _active_player_count(db, tournament_id) >= tournament.max_players:
        raise HTTPException(status_code=400, detail="This tournament is full.")

    athlete = db.query(models.Athlete).filter(models.Athlete.id == user.athlete_id).first()
    player = models.Player(
        id=f"P_{uuid.uuid4().hex[:8]}",
        tournament_id=tournament_id,
        athlete_id=athlete.id,
        name=athlete.name,
    )
    db.add(player)
    _auto_close_registration_if_full(db, tournament)
    db.commit()
    db.refresh(player)
    return player


@router.get("/me/next-match", response_model=Optional[NextMatchResponse])
def get_my_next_match(
    tournament_id: str,
    current_user: CurrentUser = Depends(require_player),
    db: Session = Depends(get_db),
):
    """
    The logged-in player's own next (or currently live) match in this tournament, for the
    public tournament page's "up next" widget. Returns null -- not a 404 -- whenever there's
    nothing to show: not registered here, no athlete link yet, or every one of their matches is
    already decided (eliminated, bye'd through, or the schedule hasn't been generated yet).
    An in-progress match always outranks a merely-scheduled one; ties break on the earliest
    scheduled time, then round number, so an unscheduled match still resolves deterministically.
    """
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user.athlete_id:
        return None

    my_player = db.query(models.Player).filter(
        models.Player.tournament_id == tournament_id,
        models.Player.athlete_id == user.athlete_id,
    ).first()
    if not my_player:
        return None

    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    matches = tournament.matches
    my_matches = [
        m for m in matches
        if m.status != models.MatchStatus.COMPLETED
        and my_player.id in (m.player1_id, m.player2_id)
    ]
    if not my_matches:
        return None

    my_matches.sort(
        key=lambda m: (
            m.status != models.MatchStatus.IN_PROGRESS,
            m.scheduled_start_time is None,
            m.scheduled_start_time or datetime.max,
            m.round_num,
        )
    )
    match = my_matches[0]

    players_by_id = {p.id: p for p in tournament.players}
    courts_by_id = {c.id: c.name for c in tournament.courts}
    opponent_id = match.player2_id if match.player1_id == my_player.id else match.player1_id
    opponent = players_by_id.get(opponent_id)
    round_label = build_round_label_fn(matches)

    return NextMatchResponse(
        match_id=match.id,
        round_label=round_label(match.stage, match.round_num, match.group_id),
        court_name=courts_by_id.get(match.court_id),
        status=match.status,
        scheduled_start_time=match.scheduled_start_time,
        opponent_name=opponent.name if opponent else "TBD",
        opponent_is_placeholder=opponent.is_placeholder if opponent else True,
    )


@router.post("/batch", response_model=List[PlayerResponse], status_code=status.HTTP_201_CREATED)
def register_players_batch(
    tournament_id: str,
    payload: PlayerBatchCreate,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db)
):
    """Registers multiple players in a single transaction (e.g., from an Excel roster)."""
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    if tournament.status not in (models.TournamentStatus.DRAFT, models.TournamentStatus.SCHEDULING):
        raise HTTPException(
            status_code=400,
            detail="Cannot add players once the tournament is in progress or completed."
        )

    created_players = []
    for p_in in payload.players:
        athlete = _find_or_create_athlete(db, p_in.name, p_in.email)
        player = models.Player(
            id=f"P_{uuid.uuid4().hex[:8]}",
            tournament_id=tournament_id,
            athlete_id=athlete.id if athlete else None,
            name=p_in.name,
            seed=p_in.seed,
            is_placeholder=p_in.is_placeholder
        )
        db.add(player)
        created_players.append(player)

    if any(not p.is_placeholder for p in created_players):
        _auto_close_registration_if_full(db, tournament)
    db.commit()
    for p in created_players:
        db.refresh(p)
    return created_players


@router.get("", response_model=List[PlayerResponse])
def list_tournament_players(
    tournament_id: str,
    include_placeholders: bool = False,
    current_user: CurrentUser = Depends(require_operator_or_organiser),
    db: Session = Depends(get_db)
):
    """Retrieves all registered players for a tournament."""
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    query = db.query(models.Player).filter(models.Player.tournament_id == tournament_id)
    if not include_placeholders:
        query = query.filter(models.Player.is_placeholder == False)

    return query.order_by(models.Player.seed.asc().nullslast()).all()


@router.patch("/team-assignments", response_model=List[PlayerResponse])
def update_team_assignments(
    tournament_id: str,
    payload: TeamAssignmentBulkUpdate,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """
    Saves every player's TEAM_FRIENDLY team/captain assignment in one transaction, replacing the
    old one-PATCH-per-click flow. The frontend always sends the full roster's current draft (not
    a diff), so this is a plain overwrite of `team`/`is_captain` for the given player ids -- no
    merge logic needed, and the captain-uniqueness check only has to scan this one list.
    """
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    if tournament.format != models.TournamentFormat.TEAM_FRIENDLY:
        raise HTTPException(status_code=400, detail="Team assignments only apply to TEAM_FRIENDLY tournaments.")

    if tournament.status not in (models.TournamentStatus.DRAFT, models.TournamentStatus.SCHEDULING):
        raise HTTPException(
            status_code=400,
            detail="Cannot edit players once the tournament is in progress or completed."
        )

    captain_teams_seen = set()
    for item in payload.assignments:
        if item.is_captain:
            if item.team is None:
                raise HTTPException(status_code=400, detail="A captain must be assigned to a team.")
            if item.team in captain_teams_seen:
                raise HTTPException(status_code=400, detail=f"Team {item.team} can only have one captain.")
            captain_teams_seen.add(item.team)

    players_by_id = {
        p.id: p for p in db.query(models.Player).filter(
            models.Player.tournament_id == tournament_id,
            models.Player.id.in_([item.player_id for item in payload.assignments]),
        ).all()
    }

    updated_players = []
    for item in payload.assignments:
        player = players_by_id.get(item.player_id)
        if not player:
            raise HTTPException(status_code=404, detail=f"Player {item.player_id} not found in this tournament.")
        player.team = item.team
        player.is_captain = item.is_captain
        updated_players.append(player)

    db.commit()
    for p in updated_players:
        db.refresh(p)
    return updated_players


@router.patch("/team-id-assignments", response_model=List[PlayerResponse])
def update_player_team_id_assignments(
    tournament_id: str,
    payload: PlayerTeamAssignmentsUpdate,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """
    Quick single/multi-row team reassignment from the main roster list: for a TEAM tournament,
    moves players between `TournamentTeam`s by `team_id`; for TEAM_FRIENDLY, moves players
    between sides A/B by `team` (captain status untouched -- that still only changes through
    `update_team_assignments` above, TeamFriendlyPanel's dedicated draft/captain editor).
    Same "frontend sends only the changed rows" contract either way: a plain per-row
    overwrite, not a diff against existing assignments.
    """
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    if tournament.status not in (models.TournamentStatus.DRAFT, models.TournamentStatus.SCHEDULING):
        raise HTTPException(
            status_code=400,
            detail="Cannot edit players once the tournament is in progress or completed."
        )

    is_team_type = tournament.tournament_type == models.TournamentType.TEAM
    valid_team_ids = {t.id for t in tournament.teams} if is_team_type else set()

    players_by_id = {
        p.id: p for p in db.query(models.Player).filter(
            models.Player.tournament_id == tournament_id,
            models.Player.id.in_([item.player_id for item in payload.assignments]),
        ).all()
    }

    updated_players = []
    for item in payload.assignments:
        player = players_by_id.get(item.player_id)
        if not player:
            raise HTTPException(status_code=404, detail=f"Player {item.player_id} not found in this tournament.")
        if is_team_type:
            if item.team_id is not None and item.team_id not in valid_team_ids:
                raise HTTPException(status_code=400, detail=f"Team {item.team_id} does not belong to this tournament.")
            player.team_id = item.team_id
        else:
            if item.team not in (None, "A", "B"):
                raise HTTPException(status_code=400, detail="team must be 'A', 'B', or omitted.")
            player.team = item.team
        updated_players.append(player)

    db.commit()
    for p in updated_players:
        db.refresh(p)
    return updated_players


@router.patch("/{player_id}", response_model=PlayerResponse)
def update_player(
    tournament_id: str,
    player_id: str,
    payload: PlayerUpdate,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """Edits a roster slot's own fields — seed, team (TEAM_FRIENDLY), or requested match count.
    Does not touch identity (name/athlete link) resolution beyond the plain name field."""
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    if tournament.status not in (models.TournamentStatus.DRAFT, models.TournamentStatus.SCHEDULING):
        raise HTTPException(
            status_code=400,
            detail="Cannot edit players once the tournament is in progress or completed."
        )

    player = db.query(models.Player).filter(
        models.Player.id == player_id,
        models.Player.tournament_id == tournament_id,
    ).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found in this tournament.")

    updates = payload.model_dump(exclude_unset=True)
    if "team" in updates and updates["team"] is not None and updates["team"] not in ("A", "B"):
        raise HTTPException(status_code=400, detail="Team must be 'A' or 'B'.")

    if "team_id" in updates:
        if tournament.tournament_type != models.TournamentType.TEAM:
            raise HTTPException(status_code=400, detail="Team assignment is only available in team tournaments.")
        new_team_id = updates["team_id"]
        if new_team_id is not None:
            team = db.query(models.TournamentTeam).filter(
                models.TournamentTeam.id == new_team_id,
                models.TournamentTeam.tournament_id == tournament_id,
            ).first()
            if not team:
                raise HTTPException(status_code=400, detail="Choose a team from this tournament.")
        if player.team_id and player.team_id != new_team_id:
            old_team = db.query(models.TournamentTeam).filter(
                models.TournamentTeam.id == player.team_id
            ).first()
            if old_team and old_team.captain_player_id == player.id:
                old_team.captain_player_id = None

    for field, value in updates.items():
        setattr(player, field, value)

    db.commit()
    db.refresh(player)
    return player


@router.delete("")
def delete_all_players(
    tournament_id: str,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db)
):
    """Removes every player from a DRAFT tournament's roster so a fresh roster can be added."""
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    if tournament.status not in (models.TournamentStatus.DRAFT, models.TournamentStatus.SCHEDULING):
        raise HTTPException(
            status_code=400,
            detail="Cannot remove players once the tournament is in progress or completed."
        )

    if db.query(models.Match).filter(models.Match.tournament_id == tournament_id).first():
        raise HTTPException(status_code=400, detail="Cannot remove players while fixtures exist for this tournament.")

    for team in db.query(models.TournamentTeam).filter(models.TournamentTeam.tournament_id == tournament_id):
        team.captain_player_id = None
    deleted = db.query(models.Player).filter(models.Player.tournament_id == tournament_id).delete(synchronize_session=False)
    db.commit()
    return {"message": "Roster cleared.", "deleted_count": deleted}


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_roster_file(
    tournament_id: str,
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db)
):
    """
    Ingests a CSV or Excel (.xlsx) file of players.
    Columns expected: name (required), email, phone, club_or_city.
    Automatically matches existing athletes or creates new global profiles.
    """
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    if tournament.status not in (models.TournamentStatus.DRAFT, models.TournamentStatus.SCHEDULING):
        raise HTTPException(
            status_code=400,
            detail="Cannot add players once the tournament is in progress or completed."
        )

    # 1. Read and parse the file
    content = await file.read()
    filename = file.filename.lower()
    
    parsed_rows: List[Dict[str, str]] = []

    try:
        if filename.endswith(".csv"):
            # Parse CSV
            decoded_content = content.decode("utf-8-sig") # utf-8-sig handles Excel CSV exports well
            reader = csv.DictReader(io.StringIO(decoded_content))
            for row in reader:
                parsed_rows.append({k.strip().lower(): v.strip() for k, v in row.items() if k and v})
                
        elif filename.endswith(".xlsx"):
            # Parse Excel
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
            sheet = wb.active
            headers = [str(cell.value).strip().lower() for cell in sheet[1] if cell.value]
            
            for row in sheet.iter_rows(min_row=2, values_only=True):
                row_data = {headers[i]: str(row[i]).strip() for i in range(len(headers)) if i < len(row) and row[i] is not None}
                if row_data:
                    parsed_rows.append(row_data)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Please upload a .csv or .xlsx file.")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file: {str(e)}")

    if not parsed_rows:
        raise HTTPException(status_code=400, detail="The uploaded file contains no data.")

    # 2. Process rows and deduplicate athletes
    stats = {
        "total_processed": 0,
        "new_athletes_created": 0,
        "returning_athletes": 0,
        "skipped_duplicates": 0,
        "invalid_phone_skipped": 0,
    }

    for row in parsed_rows:
        name = row.get("name")
        if not name:
            continue # Name is mandatory, skip empty/invalid rows

        email = row.get("email") or None
        phone = row.get("phone") or None
        if phone:
            try:
                phone = normalize_indian_phone(phone)
            except ValueError:
                phone = None
                stats["invalid_phone_skipped"] += 1
        club_or_city = row.get("club_or_city") or row.get("club") or row.get("city") or None

        # Look for existing athlete by email, then by phone
        athlete = None
        if email:
            athlete = db.query(models.Athlete).filter(models.Athlete.email == email).first()
        if not athlete and phone:
            athlete = db.query(models.Athlete).filter(models.Athlete.phone == phone).first()

        if athlete:
            stats["returning_athletes"] += 1
            # Update missing info if the returning athlete didn't have it
            if email and not athlete.email: athlete.email = email
            if phone and not athlete.phone: athlete.phone = phone
            if club_or_city and not athlete.club_or_city: athlete.club_or_city = club_or_city
        else:
            # Create new global athlete
            athlete = models.Athlete(
                name=name,
                email=email,
                phone=phone,
                club_or_city=club_or_city
            )
            db.add(athlete)
            db.flush() # Generate ID immediately
            stats["new_athletes_created"] += 1

        # 3. Check if already registered in this specific tournament
        existing_entry = db.query(models.Player).filter(
            models.Player.tournament_id == tournament_id,
            models.Player.athlete_id == athlete.id
        ).first()

        if existing_entry:
            stats["skipped_duplicates"] += 1
            continue

        # 4. Add to Tournament Roster (Notice: No seed is set!)
        player = models.Player(
            id=f"P_{uuid.uuid4().hex[:8]}",
            tournament_id=tournament_id,
            athlete_id=athlete.id,
            name=athlete.name,
            is_placeholder=False
        )
        db.add(player)
        stats["total_processed"] += 1

    if stats["total_processed"] > 0:
        _auto_close_registration_if_full(db, tournament)
    db.commit()
    return {
        "message": "Roster upload complete.",
        "stats": stats
    }


# =====================================================================
# WITHDRAWAL (INJURY / EMERGENCY / NO-SHOW)
# =====================================================================
@router.post("/{player_id}/withdraw", response_model=PlayerWithdrawResponse)
def withdraw_player(
    tournament_id: str,
    player_id: str,
    payload: PlayerWithdrawRequest,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """
    Marks a registered player as withdrawn. Any of their pending matches whose
    opponent is already known are immediately walked over in the opponent's favor;
    the player is excluded from all future round pairings and knockout qualification.
    Already-played results are untouched.
    """
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    player = db.query(models.Player).filter(
        models.Player.id == player_id,
        models.Player.tournament_id == tournament_id,
    ).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found in this tournament.")
    if player.is_placeholder:
        raise HTTPException(status_code=400, detail="Cannot withdraw a TBD placeholder slot.")
    if player.is_withdrawn:
        raise HTTPException(status_code=400, detail="Player has already withdrawn.")

    player.is_withdrawn = True
    player.withdrawn_at = datetime.utcnow()
    player.withdrawal_reason = payload.reason
    db.flush()

    walkover_matches = resolve_pending_walkovers(tournament_id, db)

    db.commit()
    db.refresh(player)
    for m in walkover_matches:
        db.refresh(m)

    return PlayerWithdrawResponse(player=player, walkover_matches=walkover_matches)
