import collections
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
from app.services.fixture_engine.datatypes import Match, Player, MatchStage


@dataclass
class PlayerStanding:
    player_id: str
    player_name: str
    seed: int
    matches_played: int = 0
    matches_won: int = 0
    matches_lost: int = 0
    match_points: float = 0.0
    games_won: int = 0
    games_lost: int = 0
    points_won: int = 0       # Rally points scored
    points_lost: int = 0      # Rally points conceded
    buchholz: float = 0.0     # Sum of opponents' match points (Swiss)
    sonneborn_berger: float = 0.0  # Sum of defeated opponents' match points (Swiss)
    opponents_played: List[str] = field(default_factory=list)
    rank: int = 0

    @property
    def game_difference(self) -> int:
        return self.games_won - self.games_lost

    @property
    def point_difference(self) -> int:
        return self.points_won - self.points_lost


class StandingsEngine:
    """
    Computes standings and resolves tiebreakers for Group Stages (BWF rules)
    and Swiss Stages (Buchholz & Sonneborn-Berger).
    """

    @classmethod
    def calculate_group_standings(
        cls,
        players: List[Player],
        matches: List[Match],
        group_id: Optional[str] = None
    ) -> List[PlayerStanding]:
        """
        Calculates group standings using BWF GCR rules:
        1. Matches Won (Match Points)
        2. Two-player tie: Head-to-head winner
        3. Three-or-more-player tie:
           a. Game difference
           b. Rally point difference
           c. If reduced to two players at any step, head-to-head decides
        4. Tiebreaker fallback: Initial tournament seed
        """
        # Filter matches for the specific group if specified
        relevant_matches = [
            m for m in matches
            if m.is_completed and (group_id is None or m.group_id == group_id)
        ]

        player_map = {p.id: p for p in players}
        standings_dict: Dict[str, PlayerStanding] = {
            p.id: PlayerStanding(player_id=p.id, player_name=p.name, seed=p.seed)
            for p in players
        }

        # 1. Aggregate statistics from matches
        for m in relevant_matches:
            p1_id = m.player1_id
            p2_id = m.player2_id

            if not p1_id or p1_id not in standings_dict:
                continue

            # Handle BYE
            if m.is_bye or not p2_id:
                st1 = standings_dict[p1_id]
                st1.matches_played += 1
                st1.matches_won += 1
                st1.match_points += 1.0
                st1.games_won += 2
                continue

            if p2_id not in standings_dict:
                continue

            st1 = standings_dict[p1_id]
            st2 = standings_dict[p2_id]

            st1.matches_played += 1
            st2.matches_played += 1
            st1.opponents_played.append(p2_id)
            st2.opponents_played.append(p1_id)

            # Match winner
            if m.winner_id == p1_id:
                st1.matches_won += 1
                st1.match_points += 1.0
                st2.matches_lost += 1
            elif m.winner_id == p2_id:
                st2.matches_won += 1
                st2.match_points += 1.0
                st1.matches_lost += 1

            # Game & Rally Point calculation if recorded on match
            scores = getattr(m, "scores", None)
            if scores and isinstance(scores, list):
                for g1, g2 in scores:
                    st1.points_won += g1
                    st1.points_lost += g2
                    st2.points_won += g2
                    st2.points_lost += g1

                    if g1 > g2:
                        st1.games_won += 1
                        st2.games_lost += 1
                    elif g2 > g1:
                        st2.games_won += 1
                        st1.games_lost += 1
            else:
                # Default game fallback (2-0 sweep assumed if detailed scores absent)
                if m.winner_id == p1_id:
                    st1.games_won += 2
                    st2.games_lost += 2
                elif m.winner_id == p2_id:
                    st2.games_won += 2
                    st1.games_lost += 2

        # 2. Resolve Group Ties recursively
        ranked_standings = cls._resolve_group_ties(
            candidate_ids=list(standings_dict.keys()),
            standings_map=standings_dict,
            matches=relevant_matches
        )

        # Assign 1-based ranks
        for idx, s in enumerate(ranked_standings, 1):
            s.rank = idx

        return ranked_standings

    @classmethod
    def _resolve_group_ties(
        cls,
        candidate_ids: List[str],
        standings_map: Dict[str, PlayerStanding],
        matches: List[Match]
    ) -> List[PlayerStanding]:
        """Recursive tiebreaker resolution according to BWF criteria."""
        if len(candidate_ids) <= 1:
            return [standings_map[pid] for pid in candidate_ids]

        # Step A: Group candidates by Match Points
        by_points = collections.defaultdict(list)
        for pid in candidate_ids:
            by_points[standings_map[pid].match_points].append(pid)

        sorted_points = sorted(by_points.keys(), reverse=True)
        final_ranking: List[PlayerStanding] = []

        for pts in sorted_points:
            tied_ids = by_points[pts]

            if len(tied_ids) == 1:
                final_ranking.append(standings_map[tied_ids[0]])
            elif len(tied_ids) == 2:
                # Two-player tie: Head-to-Head
                winner = cls._get_head_to_head_winner(tied_ids[0], tied_ids[1], matches)
                if winner == tied_ids[0]:
                    final_ranking.extend([standings_map[tied_ids[0]], standings_map[tied_ids[1]]])
                elif winner == tied_ids[1]:
                    final_ranking.extend([standings_map[tied_ids[1]], standings_map[tied_ids[0]]])
                else:
                    # H2H tied/unplayed -> fallback to seed
                    tied_by_seed = sorted(tied_ids, key=lambda pid: standings_map[pid].seed)
                    final_ranking.extend([standings_map[pid] for pid in tied_by_seed])
            else:
                # 3+ Player tie: Check Game Difference
                by_game_diff = collections.defaultdict(list)
                for pid in tied_ids:
                    by_game_diff[standings_map[pid].game_difference].append(pid)

                if len(by_game_diff) > 1:
                    # Game diff broke or partially broke the tie -> recurse
                    sorted_gdiffs = sorted(by_game_diff.keys(), reverse=True)
                    for gd in sorted_gdiffs:
                        sub_resolved = cls._resolve_group_ties(by_game_diff[gd], standings_map, matches)
                        final_ranking.extend(sub_resolved)
                else:
                    # Game diff identical -> Check Rally Point Difference
                    by_pt_diff = collections.defaultdict(list)
                    for pid in tied_ids:
                        by_pt_diff[standings_map[pid].point_difference].append(pid)

                    if len(by_pt_diff) > 1:
                        sorted_pdiffs = sorted(by_pt_diff.keys(), reverse=True)
                        for pd in sorted_pdiffs:
                            sub_resolved = cls._resolve_group_ties(by_pt_diff[pd], standings_map, matches)
                            final_ranking.extend(sub_resolved)
                    else:
                        # Fully tied on games and points -> Fallback to tournament seed
                        tied_by_seed = sorted(tied_ids, key=lambda pid: standings_map[pid].seed)
                        final_ranking.extend([standings_map[pid] for pid in tied_by_seed])

        return final_ranking

    @classmethod
    def calculate_swiss_standings(
        cls,
        players: List[Player],
        matches: List[Match]
    ) -> List[PlayerStanding]:
        """
        Calculates Swiss standings using standard FIDE/Dutch tiebreakers:
        1. Match Points
        2. Buchholz Score (Sum of opponents' total match points)
        3. Sonneborn-Berger Score (Sum of defeated opponents' match points)
        4. Game Difference
        5. Initial Tournament Seed
        """
        relevant_matches = [
            m for m in matches
            if m.is_completed and m.stage == MatchStage.SWISS
        ]

        standings_dict: Dict[str, PlayerStanding] = {
            p.id: PlayerStanding(player_id=p.id, player_name=p.name, seed=p.seed)
            for p in players
        }

        # 1. First Pass: Calculate raw match points and game differences
        for m in relevant_matches:
            p1_id = m.player1_id
            p2_id = m.player2_id

            if not p1_id or p1_id not in standings_dict:
                continue

            if m.is_bye or not p2_id:
                st1 = standings_dict[p1_id]
                st1.matches_played += 1
                st1.matches_won += 1
                st1.match_points += 1.0
                st1.games_won += 2
                continue

            if p2_id not in standings_dict:
                continue

            st1 = standings_dict[p1_id]
            st2 = standings_dict[p2_id]

            st1.matches_played += 1
            st2.matches_played += 1
            st1.opponents_played.append(p2_id)
            st2.opponents_played.append(p1_id)

            if m.winner_id == p1_id:
                st1.matches_won += 1
                st1.match_points += 1.0
                st2.matches_lost += 1
            elif m.winner_id == p2_id:
                st2.matches_won += 1
                st2.match_points += 1.0
                st1.matches_lost += 1

            # Detailed rally scores if present
            scores = getattr(m, "scores", None)
            if scores and isinstance(scores, list):
                for g1, g2 in scores:
                    st1.points_won += g1
                    st1.points_lost += g2
                    st2.points_won += g2
                    st2.points_lost += g1
                    if g1 > g2:
                        st1.games_won += 1
                        st2.games_lost += 1
                    else:
                        st2.games_won += 1
                        st1.games_lost += 1
            else:
                if m.winner_id == p1_id:
                    st1.games_won += 2
                    st2.games_lost += 2
                elif m.winner_id == p2_id:
                    st2.games_won += 2
                    st1.games_lost += 2

        # 2. Second Pass: Calculate Buchholz & Sonneborn-Berger scores
        for st in standings_dict.values():
            st.buchholz = sum(
                standings_dict[opp_id].match_points
                for opp_id in st.opponents_played
                if opp_id in standings_dict
            )

            # Sonneborn-Berger: Points of opponents you actually beat
            for m in relevant_matches:
                if m.winner_id == st.player_id and m.player2_id:
                    defeated_id = m.player2_id if m.player1_id == st.player_id else m.player1_id
                    if defeated_id in standings_dict:
                        st.sonneborn_berger += standings_dict[defeated_id].match_points

        # 3. Sort by Swiss Hierarchy
        ranked_list = sorted(
            standings_dict.values(),
            key=lambda s: (
                -s.match_points,
                -s.buchholz,
                -s.sonneborn_berger,
                -s.game_difference,
                -s.point_difference,
                s.seed
            )
        )

        for idx, s in enumerate(ranked_list, 1):
            s.rank = idx

        return ranked_list

    @staticmethod
    def _get_head_to_head_winner(
        p1_id: str,
        p2_id: str,
        matches: List[Match]
    ) -> Optional[str]:
        """Finds who won the head-to-head match between two players."""
        for m in matches:
            if (m.player1_id == p1_id and m.player2_id == p2_id) or \
               (m.player1_id == p2_id and m.player2_id == p1_id):
                return m.winner_id
        return None