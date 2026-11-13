import random
from typing import List, Optional
from ortools.sat.python import cp_model
from app.services.fixture_engine.datatypes import Match, MatchStage, Player
from app.services.fixture_engine.generators.team_friendly import InfeasibleQuotaError


class FlexibleRoundRobinGenerator:
    @staticmethod
    def generate_quota_matches(
        players: List[Player],
        matches_per_player: int,
        seed: Optional[int] = None,
    ) -> List[Match]:
        """
        Builds a single-pool schedule where every player ends up with exactly
        `matches_per_player` matches, each against a distinct opponent — not full round robin
        (everyone plays everyone), just a fixed quota per player. Modeled as a small CP-SAT
        boolean assignment, one variable per possible pair, the same technique already used for
        TEAM_FRIENDLY's cross-team crossover schedule (`team_friendly.py`) but over all pairs in
        one pool instead of only cross-team pairs.

        Quotas are a hard constraint, so every re-generation with a different `seed` still gives
        each player exactly the match count they asked for — only *which* distinct opponents they
        draw varies, via a randomized linear objective rather than solver internals.
        """
        model = cp_model.CpModel()
        pair_vars = {}
        for i, a in enumerate(players):
            for b in players[i + 1:]:
                pair_vars[(a.id, b.id)] = model.NewBoolVar(f"x_{a.id}_{b.id}")

        def vars_touching(player_id: str):
            return [
                var for (a_id, b_id), var in pair_vars.items()
                if a_id == player_id or b_id == player_id
            ]

        for p in players:
            model.Add(sum(vars_touching(p.id)) == matches_per_player)

        rng = random.Random(seed)
        model.Minimize(sum(rng.randint(0, 1000) * var for var in pair_vars.values()))

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 5.0
        status = solver.Solve(model)

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            raise InfeasibleQuotaError(
                "No valid set of matches satisfies every player's requested match count. "
                "The number of players multiplied by matches per player must be even, and no "
                "player can request more matches than there are other players to face."
            )

        matches: List[Match] = []
        match_idx = 1
        for (a_id, b_id), var in pair_vars.items():
            if solver.Value(var):
                matches.append(
                    Match(
                        id=f"RR_M{match_idx}",
                        round_num=1,
                        stage=MatchStage.ROUND_ROBIN,
                        player1_id=a_id,
                        player2_id=b_id,
                    )
                )
                match_idx += 1

        return matches
