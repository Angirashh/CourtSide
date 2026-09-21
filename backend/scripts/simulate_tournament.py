import sys
import random
from typing import List, Dict
from app.services.fixture_engine.datatypes import Match, Player
from app.services.fixture_engine.fixture_engine import FixtureEngine


def create_sample_players(count: int = 8) -> List[Player]:
    """Generates sample badminton players with realistic names and seeds."""
    sample_names = [
        "Viktor Axelsen", "Lee Zii Jia", "Loh Kean Yew", "Kento Momota",
        "Shi Yuqi", "Anthony Ginting", "Jonatan Christie", "Lakshya Sen",
        "Chou Tien Chen", "Anders Antonsen", "Kunlavut Vitidsarn", "Kodai Naraoka"
    ]
    players = []
    for i in range(min(count, len(sample_names))):
        players.append(Player(
            id=f"P{i+1}",
            name=sample_names[i],
            seed=i + 1
        ))
    return players


def input_match_results(matches: List[Match], player_lookup: Dict[str, Player]):
    """Simulates a court referee entering match results."""
    for match in matches:
        # Check if match is already resolved via bye
        if match.is_completed or match.is_bye:
            winner = player_lookup[match.player1_id]
            print(f"⏭️  [Auto-Advance] Match {match.id}: {winner.name} advances via BYE.")
            continue

        p1 = player_lookup[match.player1_id]
        p2 = player_lookup[match.player2_id]

        while True:
            stage_info = f"{match.stage.value}"
            if match.group_id:
                stage_info += f" ({match.group_id})"

            print(f"\n🏟️  Match {match.id} | {stage_info} - Round {match.round_num}")
            print(f"  [1] {p1.name} (Seed {p1.seed})")
            print(f"  [2] {p2.name} (Seed {p2.seed})")
            print(f"  [R] Pick Random Winner")

            choice = input("Enter Winner (1/2/R): ").strip().upper()

            if choice == "1":
                match.winner_id = p1.id
                break
            elif choice == "2":
                match.winner_id = p2.id
                break
            elif choice == "R":
                match.winner_id = random.choice([p1.id, p2.id])
                print(f"  🎲 Randomly selected: {player_lookup[match.winner_id].name}")
                break
            else:
                print("  ❌ Invalid choice. Type 1, 2, or R.")

        match.is_completed = True

        winner = player_lookup[match.winner_id]
        loser_id = p2.id if match.winner_id == p1.id else p1.id
        loser = player_lookup[loser_id]

        # Update tournament record
        winner.points += 1.0
        winner.games_won += 2
        loser.games_lost += 2
        winner.opponents_played.add(loser.id)
        loser.opponents_played.add(winner.id)


def run_knockout_bracket(qualified_players: List[Player], player_lookup: Dict[str, Player], engine: FixtureEngine):
    """Progresses knockout bracket round-by-round until a champion is determined."""
    current_field = qualified_players
    round_counter = 1

    while len(current_field) > 1:
        bracket_round_name = "GRAND FINAL" if len(current_field) == 2 else f"KNOCKOUT ROUND {round_counter}"
        if len(current_field) == 4:
            bracket_round_name = "SEMIFINALS"
        elif len(current_field) == 8:
            bracket_round_name = "QUARTERFINALS"

        print(f"\n=======================================================")
        print(f"⚔️  STAGE: {bracket_round_name} ({len(current_field)} Players)")
        print(f"=======================================================")

        ko_matches = engine.generate_knockout_stage(current_field)
        input_match_results(ko_matches, player_lookup)

        # Collect winners for the next round
        current_field = [player_lookup[m.winner_id] for m in ko_matches]
        round_counter += 1

    champion = current_field[0]
    print(f"\n" + "=" * 55)
    print(f"🎉 🏆 TOURNAMENT CHAMPION: {champion.name} (Seed {champion.seed}) 🏆 🎉")
    print(f"=" * 55 + "\n")


# =====================================================================
# FORMAT 1: SWISS + KNOCKOUTS
# =====================================================================
def run_swiss_plus_knockouts():
    print("\n" + "=" * 55)
    print("🏸 FORMAT: SWISS + TOP-4 KNOCKOUT")
    print("=" * 55)

    players = create_sample_players(8)
    player_lookup = {p.id: p for p in players}
    engine = FixtureEngine()

    total_swiss_rounds = 3  # log2(8) = 3 rounds

    # Phase 1: Swiss Rounds
    for r in range(1, total_swiss_rounds + 1):
        print(f"\n-------------------------------------------------------")
        print(f"🔄 SWISS ROUND {r} of {total_swiss_rounds}")
        print(f"-------------------------------------------------------")

        round_matches = engine.generate_swiss_round(players, round_num=r)
        input_match_results(round_matches, player_lookup)

    # Phase 2: Swiss Standings
    print("\n" + "=" * 55)
    print("📊 FINAL SWISS STANDINGS")
    print("=" * 55)
    ranked_players = sorted(players, key=lambda p: (-p.points, p.seed))

    for rank, p in enumerate(ranked_players, 1):
        status = "✅ ADVANCES" if rank <= 4 else "❌ ELIMINATED"
        print(f"{rank:2d}. {p.name:<20} | Pts: {p.points:.1f} | Seed: {p.seed:<2} [{status}]")

    # Phase 3: Knockouts (Top 4)
    top_4 = ranked_players[:4]
    run_knockout_bracket(top_4, player_lookup, engine)


# =====================================================================
# FORMAT 2: GROUP STAGE + KNOCKOUTS
# =====================================================================
def run_group_stage_plus_knockouts():
    print("\n" + "=" * 55)
    print("🏸 FORMAT: GROUP STAGE (2 POOLS) + KNOCKOUTS")
    print("=" * 55)

    players = create_sample_players(8)
    player_lookup = {p.id: p for p in players}
    engine = FixtureEngine()

    # Phase 1: Snake Draft & Generate Group Round-Robin
    num_groups = 2
    group_fixtures = engine.setup_group_stage(players, num_groups=num_groups)

    print("\n👥 Groups Snake-Seeded:")
    for gid, matches in group_fixtures.items():
        # Derive pool members from the fixtures
        pool_pids = set()
        for m in matches:
            pool_pids.add(m.player1_id)
            if m.player2_id:
                pool_pids.add(m.player2_id)
        pool_names = [f"{player_lookup[pid].name} (Seed {player_lookup[pid].seed})" for pid in pool_pids]
        print(f"  {gid}: {', '.join(pool_names)}")

    # Play Group Matches
    for gid, matches in group_fixtures.items():
        print(f"\n-------------------------------------------------------")
        print(f"🏸 PLAYING {gid} ROUND-ROBIN")
        print(f"-------------------------------------------------------")
        input_match_results(matches, player_lookup)

    # Phase 2: Determine Group Standings
    print("\n" + "=" * 55)
    print("📊 GROUP STAGE FINAL STANDINGS")
    print("=" * 55)

    group_standings: Dict[str, List[Player]] = {}
    for gid, matches in group_fixtures.items():
        pool_pids = set()
        for m in matches:
            pool_pids.add(m.player1_id)
            if m.player2_id:
                pool_pids.add(m.player2_id)

        pool_players = [player_lookup[pid] for pid in pool_pids]
        # Rank within group: points desc, seed asc
        sorted_pool = sorted(pool_players, key=lambda p: (-p.points, p.seed))
        group_standings[gid] = sorted_pool

        print(f"\n[{gid}] Standings:")
        for rank, p in enumerate(sorted_pool, 1):
            status = "✅ ADVANCES" if rank <= 2 else "❌ ELIMINATED"
            print(f"  {rank}. {p.name:<18} | Pts: {p.points:.1f} | Seed: {p.seed:<2} [{status}]")

    # Phase 3: Cross-Pool Crossover Seeding for Semifinals
    # Standard crossover bracket:
    # Seed 1 = Pool A Winner
    # Seed 2 = Pool B Winner
    # Seed 3 = Pool A Runner-up
    # Seed 4 = Pool B Runner-up
    # Knockout pairing automatically builds: (Seed 1 vs Seed 4) and (Seed 2 vs Seed 3)
    # This ensures: Pool A Winner vs Pool B Runner-up & Pool B Winner vs Pool A Runner-up
    pool_a_rank = group_standings["Group_A"]
    pool_b_rank = group_standings["Group_B"]

    knockout_qualifiers = [
        pool_a_rank[0],  # Bracket Seed 1 (A1)
        pool_b_rank[0],  # Bracket Seed 2 (B1)
        pool_a_rank[1],  # Bracket Seed 3 (A2)
        pool_b_rank[1],  # Bracket Seed 4 (B2)
    ]

    print("\n🔁 Crossover Semifinals Seeded:")
    print(f"  Match 1: {knockout_qualifiers[0].name} (Group A #1) vs {knockout_qualifiers[3].name} (Group B #2)")
    print(f"  Match 2: {knockout_qualifiers[1].name} (Group B #1) vs {knockout_qualifiers[2].name} (Group A #2)")

    # Reset match stats for knockout stage cleanly
    for p in knockout_qualifiers:
        p.opponents_played.clear()

    run_knockout_bracket(knockout_qualifiers, player_lookup, engine)


# =====================================================================
# MAIN MENU
# =====================================================================
def main():
    while True:
        print("\n" + "=" * 55)
        print("🏸 BADMINTON TOURNAMENT RUNNER & SIMULATOR 🏸")
        print("=" * 55)
        print("[1] Swiss Stage + Knockouts")
        print("[2] Group Stage + Knockouts")
        print("[Q] Exit")
        print("=" * 55)

        choice = input("Select Format (1/2/Q): ").strip().upper()

        if choice == "1":
            run_swiss_plus_knockouts()
        elif choice == "2":
            run_group_stage_plus_knockouts()
        elif choice == "Q":
            print("Exiting simulator. Goodbye!")
            sys.exit(0)
        else:
            print("❌ Invalid selection. Please enter 1, 2, or Q.")


if __name__ == "__main__":
    main()