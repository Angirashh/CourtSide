from typing import List, Tuple, Optional
import networkx as nx
from app.services.fixture_engine.datatypes import Match, MatchStage, Player


class SwissPairingGenerator:
    @staticmethod
    def _allocate_bye(players: List[Player]) -> Tuple[Optional[Player], List[Player]]:
        if len(players) % 2 == 0:
            return None, players

        candidates = sorted(players, key=lambda p: (p.points, -p.seed))
        for candidate in candidates:
            if not candidate.received_bye:
                candidate.received_bye = True
                remaining = [p for p in players if p.id != candidate.id]
                return candidate, remaining

        fallback = candidates[0]
        remaining = [p for p in players if p.id != fallback.id]
        return fallback, remaining

    @classmethod
    def generate_round_pairings(
        cls,
        players: List[Player],
        round_num: int
    ) -> List[Match]:
        bye_player, active_players = cls._allocate_bye(players)
        matches: List[Match] = []
        match_idx = 1

        if bye_player:
            matches.append(
                Match(
                    id=f"SWISS_R{round_num}_BYE_{bye_player.id}",
                    round_num=round_num,
                    stage=MatchStage.SWISS,
                    player1_id=bye_player.id,
                    player2_id=None,
                    winner_id=bye_player.id,
                    is_completed=True
                )
            )

        # 1. Sort players strictly by points (descending) and seed (ascending)
        active_players = sorted(active_players, key=lambda p: (-p.points, p.seed))

        # 2. Group players by their current points to find their exact rank within their score bracket
        score_groups = {}
        for p in active_players:
            if p.points not in score_groups:
                score_groups[p.points] = []
            score_groups[p.points].append(p.id)

        G = nx.Graph()
        for p in active_players:
            G.add_node(p.id, player=p)

        # 3. Calculate strict Dutch System weights
        for i in range(len(active_players)):
            for j in range(i + 1, len(active_players)):
                p1 = active_players[i]
                p2 = active_players[j]

                has_played = p2.id in p1.opponents_played
                score_diff = abs(p1.points - p2.points)
                
                # Base weight prioritizes pairing players with the same points
                weight = 1000000.0 - (score_diff * 100000.0)

                if score_diff == 0:
                    # In a Dutch system, a group of N players is split in half.
                    # The ideal opponent for index i is index i + (N/2).
                    group = score_groups[p1.points]
                    half_size = len(group) // 2
                    
                    idx1 = group.index(p1.id)
                    idx2 = group.index(p2.id)
                    idx_diff = abs(idx1 - idx2)
                    
                    # We heavily penalize any deviation from this perfect half-size split
                    deviation = abs(half_size - idx_diff)
                    weight -= (deviation * 1000.0)
                else:
                    # If players from different score groups are forced to play (floaters),
                    # penalize large seed differences so the match remains somewhat balanced
                    seed_diff = abs(p1.seed - p2.seed)
                    weight -= (seed_diff * 10.0)

                if has_played:
                    # Strict rematch penalty
                    weight -= 5000000.0

                G.add_edge(p1.id, p2.id, weight=weight)

        matching = nx.max_weight_matching(G, maxcardinality=True)

        for u, v in matching:
            matches.append(
                Match(
                    id=f"SWISS_R{round_num}_M{match_idx}",
                    round_num=round_num,
                    stage=MatchStage.SWISS,
                    player1_id=u,
                    player2_id=v
                )
            )
            match_idx += 1

        return matches