from app.services.fixture_engine.datatypes import Match, MatchStage, Player
from app.services.standings import StandingsEngine


def test_group_stage_tiebreakers():
    print("=" * 80)
    print("🏸 TEST 1: GROUP STAGE 3-WAY TIE (BWF RULES)")
    print("=" * 80)

    # 4 Players in Group A: P1, P2, P3, P4
    players = [
        Player(id="P1", name="Viktor Axelsen", seed=1),
        Player(id="P2", name="Lee Zii Jia", seed=2),
        Player(id="P3", name="Loh Kean Yew", seed=3),
        Player(id="P4", name="Anthony Ginting", seed=4),
    ]

    # SCENARIO: P1 beats P2, P2 beats P3, P3 beats P1. All beat P4.
    # Result: P1, P2, P3 are tied with 2 wins (2.0 pts) each!
    # Tiebreaker must be resolved via Game Differential, then Point Differential.
    matches = [
        # Round 1
        Match(id="M1", stage=MatchStage.GROUP, group_id="Group_A", round_num=1,
              player1_id="P1", player2_id="P4", winner_id="P1", is_completed=True),
        Match(id="M2", stage=MatchStage.GROUP, group_id="Group_A", round_num=1,
              player1_id="P2", player2_id="P3", winner_id="P2", is_completed=True),
        # Round 2
        Match(id="M3", stage=MatchStage.GROUP, group_id="Group_A", round_num=2,
              player1_id="P1", player2_id="P3", winner_id="P3", is_completed=True),
        Match(id="M4", stage=MatchStage.GROUP, group_id="Group_A", round_num=2,
              player1_id="P4", player2_id="P2", winner_id="P2", is_completed=True),
        # Round 3
        Match(id="M5", stage=MatchStage.GROUP, group_id="Group_A", round_num=3,
              player1_id="P1", player2_id="P2", winner_id="P1", is_completed=True),
        Match(id="M6", stage=MatchStage.GROUP, group_id="Group_A", round_num=3,
              player1_id="P3", player2_id="P4", winner_id="P3", is_completed=True),
    ]

    # Attach set/rally scores:
    # P1 beats P4 (21-10, 21-12) -> +2 games, +20 rally pts
    matches[0].scores = [(21, 10), (21, 12)]
    # P2 beats P3 in 3 tight games (21-19, 18-21, 21-18) -> +1 game, +2 rally pts
    matches[1].scores = [(21, 19), (18, 21), (21, 18)]
    # P3 beats P1 (21-15, 21-16) -> +2 games, +11 rally pts
    matches[2].scores = [(15, 21), (16, 21)]
    # P2 beats P4 (21-14, 21-15) -> +2 games, +13 rally pts
    matches[3].scores = [(14, 21), (15, 21)]
    # P1 beats P2 in 3 games (21-18, 17-21, 21-19) -> +1 game, +1 rally pt
    matches[4].scores = [(21, 18), (17, 21), (21, 19)]
    # P3 beats P4 (21-11, 21-13) -> +2 games, +18 rally pts
    matches[5].scores = [(21, 11), (21, 13)]

    standings = StandingsEngine.calculate_group_standings(players, matches, group_id="Group_A")

    print(f"{'Rank':<5} | {'Player':<18} | {'Won':<4} | {'Lost':<4} | {'Games':<8} | {'Game Diff':<10} | {'Point Diff'}")
    print("-" * 80)
    for s in standings:
        games_str = f"{s.games_won}-{s.games_lost}"
        print(f"{s.rank:<5} | {s.player_name:<18} | {s.matches_won:<4} | {s.matches_lost:<4} | {games_str:<8} | {s.game_difference:<+10} | {s.point_difference:<+10}")


def test_swiss_stage_tiebreakers():
    print("\n" + "=" * 80)
    print("🏸 TEST 2: SWISS STAGE BUCHHOLZ TIEBREAKERS")
    print("=" * 80)

    # 4 Players across 2 Swiss Rounds
    players = [
        Player(id="P1", name="Viktor Axelsen", seed=1),
        Player(id="P2", name="Lee Zii Jia", seed=2),
        Player(id="P3", name="Loh Kean Yew", seed=3),
        Player(id="P4", name="Anthony Ginting", seed=4),
    ]

    # Round 1:
    # P1 beats P3
    # P2 beats P4
    # Round 2:
    # P1 beats P2 (P1 is 2-0, P2 is 1-1)
    # P3 beats P4 (P3 is 1-1, P4 is 0-2)
    # Notice: P2 and P3 both have 1-1 (1.0 pt).
    # Buchholz check:
    # P2 played P4 (0 pts) and P1 (2 pts) -> Buchholz = 2.0
    # P3 played P1 (2 pts) and P4 (0 pts) -> Buchholz = 2.0
    # Sonneborn-Berger check:
    # P2 defeated P4 (who has 0 pts) -> SB = 0.0
    # P3 defeated P4 (who has 0 pts) -> SB = 0.0
    # Head-to-Head did not occur! -> Resolved by Seed (P2 Seed 2 beats P3 Seed 3).
    matches = [
        Match(id="S1", stage=MatchStage.SWISS, round_num=1, player1_id="P1", player2_id="P3", winner_id="P1", is_completed=True),
        Match(id="S2", stage=MatchStage.SWISS, round_num=1, player1_id="P2", player2_id="P4", winner_id="P2", is_completed=True),
        Match(id="S3", stage=MatchStage.SWISS, round_num=2, player1_id="P1", player2_id="P2", winner_id="P1", is_completed=True),
        Match(id="S4", stage=MatchStage.SWISS, round_num=2, player1_id="P3", player2_id="P4", winner_id="P3", is_completed=True),
    ]

    standings = StandingsEngine.calculate_swiss_standings(players, matches)

    print(f"{'Rank':<5} | {'Player':<18} | {'Pts':<5} | {'Buchholz':<9} | {'S-Berger':<9} | {'Game Diff':<10} | {'Seed'}")
    print("-" * 80)
    for s in standings:
        print(f"{s.rank:<5} | {s.player_name:<18} | {s.match_points:<5.1f} | {s.buchholz:<9.1f} | {s.sonneborn_berger:<9.1f} | {s.game_difference:<+10} | {s.seed}")


if __name__ == "__main__":
    test_group_stage_tiebreakers()
    test_swiss_stage_tiebreakers()