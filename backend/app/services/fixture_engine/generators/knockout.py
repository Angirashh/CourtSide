import math
from typing import List, Optional
from app.services.fixture_engine.datatypes import Match, MatchStage, Player


class KnockoutGenerator:
    @staticmethod
    def _generate_bracket_seed_order(bracket_size: int) -> List[int]:
        """
        Produces seed pairings so that Seed 1 plays Seed N, Seed 2 plays Seed N-1,
        and Seed 1 & 2 land on opposite sides of the bracket.
        """
        rounds = int(math.log2(bracket_size))
        seeds = [1, 2]
        for _ in range(rounds - 1):
            next_seeds = []
            complement = len(seeds) * 2 + 1
            for s in seeds:
                next_seeds.extend([s, complement - s])
            seeds = next_seeds
        return seeds

    @classmethod
    def generate_bracket(
        cls,
        qualified_players: List[Player],
        start_round_num: int = 1
    ) -> List[Match]:
        """
        Takes players ordered by rank/seed and builds Round 1 of the bracket.
        """
        n = len(qualified_players)
        bracket_size = 2 ** math.ceil(math.log2(n)) if n > 1 else 2
        seed_order = cls._generate_bracket_seed_order(bracket_size)

        # Map seeds to players (1-indexed)
        player_by_seed = {i + 1: qualified_players[i] for i in range(n)}
        round_matches: List[Match] = []

        for i in range(0, len(seed_order), 2):
            seed_a = seed_order[i]
            seed_b = seed_order[i + 1]

            player_a = player_by_seed.get(seed_a)
            player_b = player_by_seed.get(seed_b)

            match_id = f"KO_R{start_round_num}_M{(i // 2) + 1}"

            if player_a and player_b:
                round_matches.append(
                    Match(
                        id=match_id,
                        round_num=start_round_num,
                        stage=MatchStage.KNOCKOUT,
                        player1_id=player_a.id,
                        player2_id=player_b.id
                    )
                )
            elif player_a and not player_b:
                # Bye advances top seed
                round_matches.append(
                    Match(
                        id=match_id,
                        round_num=start_round_num,
                        stage=MatchStage.KNOCKOUT,
                        player1_id=player_a.id,
                        player2_id=None,
                        winner_id=player_a.id,
                        is_completed=True
                    )
                )

        return round_matches