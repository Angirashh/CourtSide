import math
from typing import List, Optional
from app.services.fixture_engine.datatypes import Match, MatchStage, Player

class RoundRobinGenerator:
    @staticmethod
    def generate_group_fixtures(
        players: List[Player],
        group_id: str,
        stage: MatchStage = MatchStage.GROUP
    ) -> List[Match]:
        player_pool: List[Optional[str]] = [p.id for p in players]
        if len(player_pool) % 2 != 0:
            player_pool.append(None)  # Bye placeholder

        n = len(player_pool)
        rounds = n - 1
        half = n // 2
        matches: List[Match] = []
        match_counter = 1

        for r in range(rounds):
            for i in range(half):
                p1 = player_pool[i]
                p2 = player_pool[n - 1 - i]

                if p1 is not None and p2 is not None:
                    # Normal match
                    matches.append(
                        Match(
                            id=f"{group_id}_R{r+1}_M{match_counter}",
                            round_num=r + 1,
                            stage=stage,
                            player1_id=p1,
                            player2_id=p2,
                            group_id=group_id
                        )
                    )
                    match_counter += 1
                else:
                    # One of them is None, so the other gets the bye
                    active_player = p1 if p1 is not None else p2
                    matches.append(
                        Match(
                            id=f"{group_id}_R{r+1}_BYE_{active_player}",
                            round_num=r + 1,
                            stage=stage,
                            player1_id=active_player, # The actual player
                            player2_id=None,
                            group_id=group_id,
                            winner_id=active_player,  # Auto-win for bye
                            is_completed=True
                        )
                    )

            # Rotate array keeping player_pool[0] fixed (Circle Method)
            player_pool = [player_pool[0]] + [player_pool[-1]] + player_pool[1:-1]

        return matches