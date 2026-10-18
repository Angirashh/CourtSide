"""Format progression for team ties; game scoring and scheduling remain separate concerns."""
from typing import Set

from sqlalchemy.orm import Session

from app.db import models
from app.services.fixture_engine.datatypes import Player as EngineTeam
from app.services.fixture_engine.fixture_engine import FixtureEngine
from app.services.team_competition import calculate_team_standings


def finalize_team_tie(tie: models.TeamTie, db: Session) -> None:
    if tie.stage == models.MatchStage.KNOCKOUT and tie.winner_team_id:
        _propagate_knockout_winner(tie, db)
    elif tie.stage == models.MatchStage.GROUP:
        _transition_groups(tie.tournament_id, db)
    elif tie.stage == models.MatchStage.SWISS:
        _transition_swiss(tie.tournament_id, tie.round_num, db)


def _propagate_knockout_winner(tie: models.TeamTie, db: Session) -> None:
    suffix = tie.id.removeprefix(f"{tie.tournament_id}_")
    candidates: Set[str] = {f"TBD_{suffix}_Win", f"{tie.tournament_id}_TBD_{suffix}_Win"}
    if suffix.startswith("KO_"):
        candidates.update({f"TBD_{suffix[3:]}_Win", f"{tie.tournament_id}_TBD_{suffix[3:]}_Win"})
    round_one = db.query(models.TeamTie).filter(
        models.TeamTie.tournament_id == tie.tournament_id,
        models.TeamTie.stage == models.MatchStage.KNOCKOUT,
        models.TeamTie.round_num == 1,
    ).order_by(models.TeamTie.id.asc()).all()
    if tie.stage == models.MatchStage.KNOCKOUT and tie.round_num == 1:
        for idx, candidate in enumerate(round_one, start=1):
            if candidate.id == tie.id:
                candidates.update({f"TBD_SF{idx}_Win", f"{tie.tournament_id}_TBD_SF{idx}_Win"})
    for downstream in db.query(models.TeamTie).filter(
        models.TeamTie.tournament_id == tie.tournament_id,
        models.TeamTie.stage == models.MatchStage.KNOCKOUT,
        models.TeamTie.id != tie.id,
    ).all():
        if downstream.team1_id in candidates:
            downstream.team1_id = tie.winner_team_id
        if downstream.team2_id in candidates:
            downstream.team2_id = tie.winner_team_id
    db.flush()


def _replace_seed_slot(tournament_id: str, seed: int, team_id: str, db: Session) -> None:
    placeholders = {
        f"TBD_Seed_{seed}", f"{tournament_id}_TBD_Seed_{seed}",
        f"TBD_Seed{seed}", f"{tournament_id}_TBD_Seed{seed}",
    }
    for tie in db.query(models.TeamTie).filter(
        models.TeamTie.tournament_id == tournament_id,
        models.TeamTie.stage == models.MatchStage.KNOCKOUT,
    ).all():
        if tie.team1_id in placeholders:
            tie.team1_id = team_id
        if tie.team2_id in placeholders:
            tie.team2_id = team_id


def _transition_groups(tournament_id: str, db: Session) -> None:
    group_ties = db.query(models.TeamTie).filter(
        models.TeamTie.tournament_id == tournament_id,
        models.TeamTie.stage == models.MatchStage.GROUP,
    ).all()
    if not group_ties or any(not tie.is_completed for tie in group_ties):
        return
    teams = db.query(models.TournamentTeam).filter(models.TournamentTeam.tournament_id == tournament_id).all()
    for group_id in sorted({tie.group_id for tie in group_ties if tie.group_id}):
        ties = [tie for tie in group_ties if tie.group_id == group_id]
        ids = {team_id for tie in ties for team_id in (tie.team1_id, tie.team2_id) if team_id}
        pool = [team for team in teams if team.id in ids]
        standings = calculate_team_standings(pool, ties)
        for seed, standing in enumerate(standings[:2], start=1):
            # Group qualifiers feed the same overall seeded knockout bracket.
            qualifier = sum(2 for _ in sorted({t.group_id for t in group_ties if t.group_id and t.group_id < group_id})) + seed
            _replace_seed_slot(tournament_id, qualifier, standing.team_id, db)
    db.flush()


def _transition_swiss(tournament_id: str, current_round: int, db: Session) -> None:
    current = db.query(models.TeamTie).filter(
        models.TeamTie.tournament_id == tournament_id,
        models.TeamTie.stage == models.MatchStage.SWISS,
        models.TeamTie.round_num == current_round,
    ).all()
    if not current or any(not tie.is_completed for tie in current):
        return
    teams = db.query(models.TournamentTeam).filter(models.TournamentTeam.tournament_id == tournament_id).all()
    all_swiss = db.query(models.TeamTie).filter(
        models.TeamTie.tournament_id == tournament_id,
        models.TeamTie.stage == models.MatchStage.SWISS,
        models.TeamTie.is_completed == True,
    ).all()
    standings = calculate_team_standings(teams, all_swiss, swiss=True)
    max_round = max(tie.round_num for tie in db.query(models.TeamTie).filter(
        models.TeamTie.tournament_id == tournament_id,
        models.TeamTie.stage == models.MatchStage.SWISS,
    ).all())

    if current_round < max_round:
        rank_by_id = {standing.team_id: idx for idx, standing in enumerate(standings)}
        teams_by_id = {team.id: team for team in teams}
        engine_teams = []
        for standing in standings:
            team = teams_by_id[standing.team_id]
            engine_teams.append(EngineTeam(
                id=team.id, name=team.name, seed=team.seed or 999,
                points=standing.match_points, games_won=standing.games_won,
                games_lost=standing.games_lost, points_won=standing.points_won,
                points_lost=standing.points_lost, opponents_played=set(standing.opponents_played),
                received_bye=any(tie.team2_id is None and tie.team1_id == team.id for tie in all_swiss),
            ))
        pairings = FixtureEngine.generate_swiss_round(engine_teams, current_round + 1)
        bye = next((pairing for pairing in pairings if pairing.is_bye), None)
        plays = sorted(
            (pairing for pairing in pairings if not pairing.is_bye),
            key=lambda pairing: min(rank_by_id.get(pairing.player1_id, 999), rank_by_id.get(pairing.player2_id, 999)),
        )
        slots = db.query(models.TeamTie).filter(
            models.TeamTie.tournament_id == tournament_id,
            models.TeamTie.stage == models.MatchStage.SWISS,
            models.TeamTie.round_num == current_round + 1,
        ).order_by(models.TeamTie.id.asc()).all()
        playable_slots = [tie for tie in slots if tie.team2_id is not None]
        bye_slots = [tie for tie in slots if tie.team2_id is None]
        for slot, pairing in zip(playable_slots, plays):
            slot.team1_id, slot.team2_id = pairing.player1_id, pairing.player2_id
        if bye and bye_slots:
            bye_slot = bye_slots[0]
            bye_slot.team1_id = bye.player1_id
            bye_slot.is_completed = True
            bye_slot.winner_team_id = bye.player1_id
        for slot in playable_slots[len(plays):]:
            db.delete(slot)
        db.flush()
        return

    for standing in standings[:4]:
        _replace_seed_slot(tournament_id, standing.rank, standing.team_id, db)
    db.flush()
