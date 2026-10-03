import random
from typing import Dict, List, Optional
from ortools.sat.python import cp_model
from app.services.fixture_engine.datatypes import Match, MatchStage, Player


class InfeasibleQuotaError(Exception):
    """Raised when no set of cross-team singles matches can satisfy every player's requested
    match count simultaneously (e.g. the two teams' totals don't match, or a player asked for
    more opponents than the other team has players)."""

    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


class TeamFriendlyGenerator:
    @staticmethod
    def generate_crossover_matches(
        team_a: List[Player],
        team_b: List[Player],
        quotas: Dict[str, int],
        seed: Optional[int] = None,
    ) -> List[Match]:
        """
        Builds a 2-team crossover singles schedule: every player ends up with exactly
        `quotas[player.id]` matches, each against a distinct opponent from the OTHER team
        (teammates never face each other). Modeled as a small CP-SAT boolean assignment —
        one variable per possible cross-team pair — consistent with how `cp_sat_solver.py`
        already uses OR-Tools for this class of combinatorial problem elsewhere in this
        codebase, rather than a bespoke max-flow + randomization routine.

        Quotas are hard constraints, so every re-generation with a different `seed` still
        gives each player exactly the match count they asked for — only *which* distinct
        opponents they're matched against varies, via a randomized linear objective (cheap
        edges preferred) rather than relying on solver internals to vary run-to-run.
        """
        model = cp_model.CpModel()
        pair_vars = {}
        for a in team_a:
            for b in team_b:
                pair_vars[(a.id, b.id)] = model.NewBoolVar(f"x_{a.id}_{b.id}")

        for a in team_a:
            model.Add(sum(pair_vars[(a.id, b.id)] for b in team_b) == quotas[a.id])
        for b in team_b:
            model.Add(sum(pair_vars[(a.id, b.id)] for a in team_a) == quotas[b.id])

        rng = random.Random(seed)
        model.Minimize(
            sum(rng.randint(0, 1000) * pair_vars[(a.id, b.id)] for a in team_a for b in team_b)
        )

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 5.0
        status = solver.Solve(model)

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            raise InfeasibleQuotaError(
                "No valid set of matches satisfies every player's requested match count. "
                "Team A's and Team B's total requested matches must be equal, and no single "
                "player can request more matches than the other team has players."
            )

        matches: List[Match] = []
        match_idx = 1
        for a in team_a:
            for b in team_b:
                if solver.Value(pair_vars[(a.id, b.id)]):
                    matches.append(
                        Match(
                            id=f"CROSS_M{match_idx}",
                            round_num=1,
                            stage=MatchStage.CROSSOVER,
                            player1_id=a.id,
                            player2_id=b.id,
                        )
                    )
                    match_idx += 1

        return matches
