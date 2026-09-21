import math
from datetime import datetime, timedelta
from typing import Dict, Any

from app.worker.celery_app import celery_app
from app.db.session import SessionLocal
from app.db import models
from app.services.fixture_engine.datatypes import (
    Player as EnginePlayer,
    Match as EngineMatch,
    MatchStage as EngineMatchStage,
)
from app.services.fixture_engine.fixture_engine import FixtureEngine
from app.services.scheduling_engine.cp_sat_solver import CourtScheduler
from app.api.routes_tournaments import _build_swiss_template_matches


def _build_group_template_matches(engine_players, num_groups, engine) -> list:
    """Helper to build Group Stage + Knockout template."""
    template_matches = []
    group_fixtures = engine.setup_group_stage(engine_players, num_groups=num_groups)
    for pool_matches in group_fixtures.values():
        template_matches.extend(pool_matches)

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
                next_round_players.append(EnginePlayer(id=advancing_id, name=advancing_id, seed=len(next_round_players) + 1))
            else:
                m.id = f"KO_R{round_num}_M{match_idx}"
                template_matches.append(m)
                winner_placeholder = f"TBD_R{round_num}_M{match_idx}_Win"
                next_round_players.append(EnginePlayer(id=winner_placeholder, name=winner_placeholder, seed=len(next_round_players) + 1))
                match_idx += 1
        current_field = next_round_players
        round_num += 1

    return template_matches


@celery_app.task(bind=True, name="tasks.generate_schedule")
def generate_tournament_schedule_task(self, tournament_id: str, start_time_iso: str, num_groups: int) -> Dict[str, Any]:
    """
    Background worker task to run the CP-SAT solver and persist schedule to the database.
    """
    db = SessionLocal()
    try:
        tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
        if not tournament:
            return {"error": "Tournament not found", "status": "FAILED"}
        
        # Mark as Scheduling
        tournament.status = models.TournamentStatus.SCHEDULING
        db.commit()

        real_players = db.query(models.Player).filter(
            models.Player.tournament_id == tournament_id,
            models.Player.is_placeholder == False
        ).order_by(models.Player.seed.asc().nullslast()).all()
        courts = db.query(models.Court).filter(models.Court.tournament_id == tournament_id).all()

        if len(real_players) < 2 or not courts:
            return {"error": "Insufficient players or courts", "status": "FAILED"}

        engine_players = [EnginePlayer(id=p.id, name=p.name, seed=p.seed or (idx + 1)) for idx, p in enumerate(real_players)]
        engine = FixtureEngine()

        if tournament.format == models.TournamentFormat.GROUP_KNOCKOUT:
            template_matches = _build_group_template_matches(engine_players, num_groups, engine)
        else:
            template_matches = _build_swiss_template_matches(engine_players, engine)

        avg_court_rate = sum(c.hourly_rate for c in courts) / len(courts) if courts else 40.0
        
        # Run CP-SAT Optimization
        solver_result = CourtScheduler.schedule_matches(
            matches=template_matches,
            num_courts=len(courts),
            match_duration=tournament.match_duration_minutes,
            rest_time=tournament.rest_time_minutes,
            court_hourly_cost=avg_court_rate
        )

        if solver_result["status"] not in ("OPTIMAL", "FEASIBLE"):
            tournament.status = models.TournamentStatus.DRAFT
            db.commit()
            return {"error": f"Solver failed: {solver_result['status']}", "status": "FAILED"}

        # Purge old generated data
        db.query(models.Match).filter(models.Match.tournament_id == tournament_id).delete()
        db.query(models.Player).filter(
            models.Player.tournament_id == tournament_id, models.Player.is_placeholder == True
        ).delete()
        db.flush()

        court_index_map = {f"Court_{idx+1}": court.id for idx, court in enumerate(courts)}
        
        # Persist placeholders
        created_placeholder_ids = set()
        for m in template_matches:
            for pid in (m.player1_id, m.player2_id):
                if pid and str(pid).startswith("TBD") and pid not in created_placeholder_ids:
                    db.add(models.Player(id=pid, tournament_id=tournament_id, name=pid, is_placeholder=True))
                    created_placeholder_ids.add(pid)
        
        # Persist matches
        schedule_lookup = {item["match_id"]: item for item in solver_result["schedule"]}
        start_time = datetime.fromisoformat(start_time_iso)

        for m in template_matches:
            sched_item = schedule_lookup.get(m.id)
            db_match = models.Match(
                id=f"{tournament_id}_{m.id}", tournament_id=tournament_id, stage=models.MatchStage(m.stage.value),
                round_num=m.round_num, group_id=m.group_id, player1_id=m.player1_id, player2_id=m.player2_id,
            )
            if sched_item:
                db_match.court_id = court_index_map.get(sched_item["court_id"])
                db_match.scheduled_start_time = start_time + timedelta(minutes=sched_item["start_minute"])
                db_match.scheduled_end_time = start_time + timedelta(minutes=sched_item["end_minute"])
            db.add(db_match)

        tournament.status = models.TournamentStatus.IN_PROGRESS
        db.commit()

        return {
            "status": "SUCCESS",
            "makespan_minutes": solver_result["makespan_minutes"],
            "total_estimated_cost": solver_result["total_cost"]
        }

    except Exception as e:
        db.rollback()
        return {"error": str(e), "status": "FAILED"}
    finally:
        db.close()