from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import CurrentUser, ensure_tournament_access, get_db, require_operator_or_organiser, require_organiser, require_player
from app.db import models
from app.schemas.team_tie import TeamGameScoreSubmission, TeamLineupSubmission
from app.schemas.tournament import TeamTieResponse
from app.services.team_competition import complete_team_tie
from app.services.team_progression import finalize_team_tie

router = APIRouter(tags=["Team Ties"])


def _load_tie(tie_id: str, db: Session) -> models.TeamTie:
    tie = db.query(models.TeamTie).options(
        joinedload(models.TeamTie.games),
        joinedload(models.TeamTie.tournament).joinedload(models.Tournament.teams),
    ).filter(models.TeamTie.id == tie_id).first()
    if not tie:
        raise HTTPException(status_code=404, detail="Team tie not found.")
    return tie


def _safe_tie_response(tie: models.TeamTie, reveal_all: bool, visible_team_id: str | None = None) -> dict:
    data = TeamTieResponse.model_validate(tie).model_dump()
    tie_started = any(game.actual_start_time for game in tie.games)
    for game in data["games"]:
        if reveal_all or tie_started:
            continue
        if visible_team_id != tie.team1_id:
            game["team1_player_ids"] = None
        if visible_team_id != tie.team2_id:
            game["team2_player_ids"] = None
    return data


def _captain_team_ids(user: CurrentUser, tournament_id: str, db: Session) -> set[str]:
    account = db.query(models.User).filter(models.User.id == user.id).first()
    if not account or not account.athlete_id:
        return set()
    captain_players = db.query(models.Player.id).filter(
        models.Player.tournament_id == tournament_id,
        models.Player.athlete_id == account.athlete_id,
        models.Player.is_placeholder == False,
    ).all()
    player_ids = [row[0] for row in captain_players]
    if not player_ids:
        return set()
    return {
        team.id for team in db.query(models.TournamentTeam).filter(
            models.TournamentTeam.tournament_id == tournament_id,
            models.TournamentTeam.captain_player_id.in_(player_ids),
        ).all()
    }


def _validate_lineup(tie: models.TeamTie, team_id: str, submission: TeamLineupSubmission, db: Session) -> dict[str, list[str]]:
    team = next((team for team in tie.tournament.teams if team.id == team_id), None)
    if not team:
        raise HTTPException(status_code=400, detail="This team is not part of the tie.")
    if tie.is_completed or any(game.actual_start_time for game in tie.games):
        raise HTTPException(status_code=400, detail="Lineups are locked once a tie has started.")
    games = {game.id: game for game in tie.games}
    submitted = {item.game_id: item.player_ids for item in submission.games}
    if set(submitted) != set(games):
        raise HTTPException(status_code=400, detail="Submit one lineup for every game in the tie.")

    eligible = {
        player.id for player in db.query(models.Player).filter(
            models.Player.tournament_id == tie.tournament_id,
            models.Player.team_id == team_id,
            models.Player.is_placeholder == False,
            models.Player.is_withdrawn == False,
        ).all()
    }
    counts = {"SINGLES": {}, "DOUBLES": {}, "MIXED_DOUBLES": {}}
    for game_id, player_ids in submitted.items():
        game = games[game_id]
        expected = 1 if game.match_type == "SINGLES" else 2
        if len(player_ids) != expected or len(set(player_ids)) != expected:
            raise HTTPException(status_code=400, detail=f"{game.match_type.title()} game {game.order_num} needs {expected} distinct player(s).")
        if not set(player_ids).issubset(eligible):
            raise HTTPException(status_code=400, detail="Lineups may only use active players from the captain's team.")
        for player_id in player_ids:
            counts[game.match_type][player_id] = counts[game.match_type].get(player_id, 0) + 1

    config = tie.tournament.team_config or {}
    for player_counts, limit_key in (
        (counts["SINGLES"], "max_singles_per_player"),
        (counts["DOUBLES"], "max_doubles_per_player"),
        (counts["MIXED_DOUBLES"], "max_mixed_doubles_per_player"),
    ):
        limit = config.get(limit_key, 0)
        if any(count > limit for count in player_counts.values()):
            raise HTTPException(status_code=400, detail=f"A player exceeds the configured {limit_key.replace('_', ' ')} for this tie.")

    # In PLAY_ALL, scheduled games in a tie may share a court window. Do not let a
    # captain assign the same player to two games that the schedule expects to run
    # simultaneously.
    if config.get("completion_mode") == "PLAY_ALL":
        ordered_games = list(games.values())
        for index, game in enumerate(ordered_games):
            if not game.scheduled_start_time or not game.scheduled_end_time:
                continue
            for other in ordered_games[index + 1:]:
                if not other.scheduled_start_time or not other.scheduled_end_time:
                    continue
                overlaps = game.scheduled_start_time < other.scheduled_end_time and other.scheduled_start_time < game.scheduled_end_time
                if overlaps and set(submitted[game.id]) & set(submitted[other.id]):
                    raise HTTPException(status_code=400, detail="A player cannot be assigned to games scheduled at the same time.")
    return submitted


@router.get("/tournaments/{tournament_id}/team-ties", response_model=list[TeamTieResponse])
def list_team_ties(
    tournament_id: str,
    current_user: CurrentUser = Depends(require_operator_or_organiser),
    db: Session = Depends(get_db),
):
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found.")
    ensure_tournament_access(tournament, current_user, db)
    ties = db.query(models.TeamTie).options(joinedload(models.TeamTie.games)).filter(
        models.TeamTie.tournament_id == tournament_id,
    ).order_by(models.TeamTie.stage, models.TeamTie.round_num, models.TeamTie.id).all()
    is_organiser = current_user.role == models.UserRole.ORGANISER
    return [_safe_tie_response(tie, is_organiser) for tie in ties]


@router.get("/players/me/team-ties", response_model=list[TeamTieResponse])
def list_captain_ties(
    current_user: CurrentUser = Depends(require_player),
    db: Session = Depends(get_db),
):
    account = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not account or not account.athlete_id:
        return []
    player_ids = db.query(models.Player.id).filter(models.Player.athlete_id == account.athlete_id).all()
    ids = [row[0] for row in player_ids]
    team_ids = [row[0] for row in db.query(models.TournamentTeam.id).filter(
        models.TournamentTeam.captain_player_id.in_(ids)
    ).all()] if ids else []
    if not team_ids:
        return []
    ties = db.query(models.TeamTie).options(joinedload(models.TeamTie.games)).filter(
        (models.TeamTie.team1_id.in_(team_ids)) | (models.TeamTie.team2_id.in_(team_ids))
    ).all()
    responses = []
    for tie in ties:
        my_team_id = next((team_id for team_id in team_ids if team_id in (tie.team1_id, tie.team2_id)), None)
        response = _safe_tie_response(tie, False, my_team_id)
        response["my_team_id"] = my_team_id
        responses.append(response)
    return responses


@router.post("/tournaments/{tournament_id}/team-ties/{tie_id}/lineup", response_model=TeamTieResponse)
def submit_captain_lineup(
    tournament_id: str,
    tie_id: str,
    payload: TeamLineupSubmission,
    current_user: CurrentUser = Depends(require_player),
    db: Session = Depends(get_db),
):
    tie = _load_tie(tie_id, db)
    if tie.tournament_id != tournament_id:
        raise HTTPException(status_code=404, detail="Team tie not found.")
    team_ids = _captain_team_ids(current_user, tournament_id, db)
    assigned = [team_id for team_id in (tie.team1_id, tie.team2_id) if team_id in team_ids]
    if len(assigned) != 1:
        raise HTTPException(status_code=403, detail="Only a captain assigned to one of these teams can submit its lineup.")
    if tie.lineups_locked:
        raise HTTPException(status_code=400, detail="The organiser has locked this tie's lineups.")
    team_id = assigned[0]
    lineups = _validate_lineup(tie, team_id, payload, db)
    for game in tie.games:
        if team_id == tie.team1_id:
            game.team1_player_ids = lineups[game.id]
        else:
            game.team2_player_ids = lineups[game.id]
    db.commit()
    db.refresh(tie)
    response = _safe_tie_response(tie, False, team_id)
    response["my_team_id"] = team_id
    return response


@router.post("/tournaments/{tournament_id}/team-ties/{tie_id}/lock", response_model=TeamTieResponse)
def lock_team_tie_lineups(
    tournament_id: str,
    tie_id: str,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    tie = _load_tie(tie_id, db)
    if tie.tournament_id != tournament_id:
        raise HTTPException(status_code=404, detail="Team tie not found.")
    ensure_tournament_access(tie.tournament, current_user, db)
    if tie.is_completed or not tie.games:
        raise HTTPException(status_code=400, detail="This tie cannot be locked.")
    for game in tie.games:
        if not game.team1_player_ids or not game.team2_player_ids:
            raise HTTPException(status_code=400, detail="Both captains must submit a lineup for every game before locking.")
    tie.lineups_locked = True
    db.commit()
    db.refresh(tie)
    return tie


@router.post("/tournaments/{tournament_id}/team-ties/{tie_id}/unlock", response_model=TeamTieResponse)
def unlock_team_tie_lineups(
    tournament_id: str,
    tie_id: str,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    tie = _load_tie(tie_id, db)
    if tie.tournament_id != tournament_id:
        raise HTTPException(status_code=404, detail="Team tie not found.")
    ensure_tournament_access(tie.tournament, current_user, db)
    if tie.is_completed or any(game.actual_start_time or game.is_completed for game in tie.games):
        raise HTTPException(status_code=400, detail="Lineups cannot be reopened after a game has started.")
    tie.lineups_locked = False
    db.commit()
    db.refresh(tie)
    return tie


@router.post("/team-games/{game_id}/start")
def start_team_game(
    game_id: str,
    current_user: CurrentUser = Depends(require_operator_or_organiser),
    db: Session = Depends(get_db),
):
    game = db.query(models.TeamTieGame).filter(models.TeamTieGame.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Team game not found.")
    tie = _load_tie(game.tie_id, db)
    ensure_tournament_access(tie.tournament, current_user, db)
    if tie.tournament.status != models.TournamentStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Start the tournament before starting a game.")
    if not tie.lineups_locked:
        raise HTTPException(status_code=400, detail="The organiser must lock both lineups before play starts.")
    if game.is_completed or game.status == models.MatchStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="This game has already started or finished.")
    completion_mode = (tie.tournament.team_config or {}).get("completion_mode", "MAJORITY")
    earlier = [row for row in tie.games if row.order_num < game.order_num]
    if completion_mode != "PLAY_ALL" and any(not row.is_completed for row in earlier):
        raise HTTPException(status_code=400, detail="Play this tie's games in the organiser's configured order.")
    if not game.team1_player_ids or not game.team2_player_ids:
        raise HTTPException(status_code=400, detail="Both captains must submit a lineup before this game starts.")
    for team_id, player_ids in ((tie.team1_id, game.team1_player_ids), (tie.team2_id, game.team2_player_ids)):
        eligible_count = db.query(models.Player.id).filter(
            models.Player.tournament_id == tie.tournament_id,
            models.Player.team_id == team_id,
            models.Player.is_placeholder == False,
            models.Player.is_withdrawn == False,
            models.Player.id.in_(player_ids),
        ).count()
        expected_count = 1 if game.match_type == "SINGLES" else 2
        if eligible_count != expected_count:
            raise HTTPException(status_code=400, detail="A submitted lineup is no longer eligible. Ask the organiser to reopen the tie and collect updated lineups.")
    game.status = models.MatchStatus.IN_PROGRESS
    game.actual_start_time = datetime.utcnow()
    game.operator_id = current_user.id
    db.commit()
    db.refresh(game)
    return game


@router.post("/team-games/{game_id}/score")
def submit_team_game_score(
    game_id: str,
    payload: TeamGameScoreSubmission,
    current_user: CurrentUser = Depends(require_operator_or_organiser),
    db: Session = Depends(get_db),
):
    game = db.query(models.TeamTieGame).filter(models.TeamTieGame.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Team game not found.")
    tie = _load_tie(game.tie_id, db)
    ensure_tournament_access(tie.tournament, current_user, db)
    if not tie.lineups_locked or game.status != models.MatchStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Start the game after the organiser locks the lineups.")
    if game.is_completed or payload.winner_team_id not in (tie.team1_id, tie.team2_id):
        raise HTTPException(status_code=400, detail="Choose a participating team and submit this game only once.")
    p1_sets = sum(1 for score in payload.scores if score.p1 > score.p2)
    p2_sets = sum(1 for score in payload.scores if score.p2 > score.p1)
    winner_sets, loser_sets = (p1_sets, p2_sets) if payload.winner_team_id == tie.team1_id else (p2_sets, p1_sets)
    if winner_sets <= loser_sets:
        raise HTTPException(status_code=400, detail="The scores don't match the selected winner.")
    game.winner_team_id = payload.winner_team_id
    game.scores = [score.model_dump() for score in payload.scores]
    game.is_completed = True
    game.status = models.MatchStatus.COMPLETED
    game.actual_end_time = datetime.utcnow()
    if not game.operator_id:
        game.operator_id = current_user.id
    mode = (tie.tournament.team_config or {}).get("completion_mode", "MAJORITY")
    if complete_team_tie(tie, mode):
        finalize_team_tie(tie, db)
    db.commit()
    db.refresh(game)
    return game
