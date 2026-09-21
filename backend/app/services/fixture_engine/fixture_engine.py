from typing import List, Dict
from app.services.fixture_engine.datatypes import Match, MatchStage, Player
from app.services.fixture_engine.generators.round_robin import RoundRobinGenerator
from app.services.fixture_engine.generators.knockout import KnockoutGenerator
from app.services.fixture_engine.generators.swiss import SwissPairingGenerator


class FixtureEngine:
    @staticmethod
    def setup_group_stage(players: List[Player], num_groups: int) -> Dict[str, List[Match]]:
        """
        Distributes players into groups using snake seeding, then generates
        round-robin schedules for each pool.
        """
        # Sort players by seed (1 = best)
        sorted_players = sorted(players, key=lambda p: p.seed)
        groups: Dict[str, List[Player]] = {f"Group_{chr(65 + i)}": [] for i in range(num_groups)}
        group_keys = list(groups.keys())

        # Snake draft seeding
        for idx, player in enumerate(sorted_players):
            cycle = idx // num_groups
            pos = idx % num_groups
            assigned_group = group_keys[pos] if cycle % 2 == 0 else group_keys[-(pos + 1)]
            groups[assigned_group].append(player)

        group_fixtures: Dict[str, List[Match]] = {}
        for gid, pool in groups.items():
            group_fixtures[gid] = RoundRobinGenerator.generate_group_fixtures(pool, group_id=gid)

        return group_fixtures

    @staticmethod
    def generate_swiss_round(players: List[Player], round_num: int) -> List[Match]:
        return SwissPairingGenerator.generate_round_pairings(players, round_num)

    @staticmethod
    def generate_knockout_stage(advancing_players: List[Player]) -> List[Match]:
        # advancing_players should already be sorted by standing/seed
        return KnockoutGenerator.generate_bracket(advancing_players, start_round_num=1)