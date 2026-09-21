import math
from datetime import datetime, timedelta
from typing import List
from app.services.fixture_engine.datatypes import Match, MatchStage, Player
from app.services.fixture_engine.fixture_engine import FixtureEngine
from app.services.scheduling_engine.cp_sat_solver import CourtScheduler


def format_time(base_time: datetime, minutes: int) -> str:
    """Converts a minute offset into a 12-hour formatted time string."""
    return (base_time + timedelta(minutes=minutes)).strftime("%I:%M %p")


def generate_swiss_tournament_template(num_players: int) -> List[Match]:
    """Generates a Swiss + Knockout timeline template."""
    matches: List[Match] = []
    if num_players % 2 != 0:
        num_players += 1

    num_swiss_rounds = math.ceil(math.log2(num_players))
    matches_per_round = num_players // 2

    # 1. Swiss Round 1 (Known real player IDs)
    for i in range(1, matches_per_round + 1):
        matches.append(Match(
            id=f"SWISS_R1_M{i}",
            round_num=1,
            stage=MatchStage.SWISS,
            player1_id=f"P{i}",
            player2_id=f"P{i + matches_per_round}"
        ))

    # 2. Swiss Subsequent Rounds (TBD placeholders)
    for r in range(2, num_swiss_rounds + 1):
        for m_idx in range(1, matches_per_round + 1):
            matches.append(Match(
                id=f"SWISS_R{r}_M{m_idx}",
                round_num=r,
                stage=MatchStage.SWISS,
                player1_id=f"TBD_R{r}_{m_idx}A",
                player2_id=f"TBD_R{r}_{m_idx}B"
            ))

    # 3. Knockout Semifinals (Top 4 advance)
    matches.extend([
        Match(id="KO_R1_M1", round_num=1, stage=MatchStage.KNOCKOUT, player1_id="TBD_Seed1", player2_id="TBD_Seed4"),
        Match(id="KO_R1_M2", round_num=1, stage=MatchStage.KNOCKOUT, player1_id="TBD_Seed2", player2_id="TBD_Seed3"),
    ])

    # 4. Knockout Final
    matches.append(
        Match(id="KO_R2_M1", round_num=2, stage=MatchStage.KNOCKOUT, player1_id="TBD_SF1_Win", player2_id="TBD_SF2_Win")
    )

    return matches


def generate_group_tournament_template(num_players: int, num_groups: int = 2) -> List[Match]:
    """Generates a Group Stage + Knockout template dynamically for ANY number of groups."""
    matches: List[Match] = []
    engine = FixtureEngine()

    # 1. Group Stage
    players = [
        Player(id=f"P{i}", name=f"P{i}", seed=i)
        for i in range(1, num_players + 1)
    ]
    group_fixtures = engine.setup_group_stage(players, num_groups=num_groups)
    for pool_matches in group_fixtures.values():
        matches.extend(pool_matches)

    # 2. Dynamic Knockout Stage (Top 2 from each pool advance)
    num_advancing = num_groups * 2

    # Initial pool of qualifiers ordered by seed
    current_field = [
        Player(id=f"TBD_Seed_{i}", name=f"TBD_Seed_{i}", seed=i)
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
                # Top seed with a bye automatically advances to the next round
                advancing_id = m.player1_id
                next_round_players.append(
                    Player(id=advancing_id, name=advancing_id, seed=len(next_round_players) + 1)
                )
            else:
                # Real match to be played on court
                m.id = f"KO_R{round_num}_M{match_idx}"
                matches.append(m)

                # The eventual winner advances to the next round
                winner_placeholder = f"TBD_R{round_num}_M{match_idx}_Win"
                next_round_players.append(
                    Player(id=winner_placeholder, name=winner_placeholder, seed=len(next_round_players) + 1)
                )
                match_idx += 1

        current_field = next_round_players
        round_num += 1

    return matches


def main():
    print("=" * 85)
    print("🏸 COURT SCHEDULER & VENUE OPTIMIZATION ENGINE")
    print("=" * 85)

    # 1. Format Selection
    print("\nSelect Tournament Format to Schedule:")
    print("  [1] Swiss + Knockouts")
    print("  [2] Group Stage + Knockouts")
    format_choice = input("Enter choice (1 or 2): ").strip() or "1"

    # 2. General Tournament Parameters
    try:
        num_players = int(input("\nEnter number of players (e.g., 8, 16): ").strip() or "8")
        if format_choice == "2":
            default_groups = "4" if num_players >= 16 else "2"
            num_groups = int(input(f"Enter number of groups/pools (e.g., {default_groups}): ").strip() or default_groups)
        else:
            num_groups = 2

        num_courts = int(input("Enter number of available courts: ").strip() or "3")
        match_duration = int(input("Enter match slot duration in minutes: ").strip() or "35")
        rest_time = int(input("Enter minimum player rest in minutes: ").strip() or "25")
        hourly_rate = float(input("Enter court cost per hour ($): ").strip() or "40.0")
    except ValueError:
        print("❌ Invalid input. Please enter numeric values.")
        return

    # 3. Generate Matches Based on Format
    if format_choice == "2":
        selected_format_label = f"Group Stage ({num_groups} Pools) + Knockouts"
        matches = generate_group_tournament_template(num_players=num_players, num_groups=num_groups)
    else:
        selected_format_label = "Swiss Stage + Knockouts"
        matches = generate_swiss_tournament_template(num_players=num_players)

    tournament_start = datetime.strptime("09:00 AM", "%I:%M %p")

    print(f"\nScheduling {len(matches)} total matches for {selected_format_label} across {num_courts} courts...")

    # 4. Run CP-SAT Optimization
    result = CourtScheduler.schedule_matches(
        matches=matches,
        num_courts=num_courts,
        match_duration=match_duration,
        rest_time=rest_time,
        court_hourly_cost=hourly_rate
    )

    if result["status"] not in ("OPTIMAL", "FEASIBLE"):
        print(f"❌ Could not find a feasible schedule. Status: {result['status']}")
        return

    # 5. Output Cost-Optimized Venue Booking Plan
    print("\n" + "=" * 85)
    print(f"💰 RECOMMENDED VENUE BOOKING PLAN ({selected_format_label.upper()})")
    print("=" * 85)
    print(f"{'Court':<10} | {'Book From':<12} | {'Book Until':<12} | {'Duration':<10} | {'Billed Hrs':<12} | {'Cost'}")
    print("-" * 85)

    for court_id, data in result["court_bookings"].items():
        from_str = format_time(tournament_start, data["booked_from_minute"])
        until_str = format_time(tournament_start, data["booked_until_minute"])
        print(
            f"{court_id:<10} | {from_str:<12} | {until_str:<12} | "
            f"{data['duration_minutes']} mins    | {data['billed_hours']:<5} hrs     | ${data['court_cost']:.2f}"
        )

    print("-" * 85)
    print(f"Total Billable Court Hours: {result['total_billable_hours']} hrs")
    print(f"Total Estimated Venue Cost: ${result['total_cost']:.2f}")

    flat_hours = (math.ceil(result["makespan_minutes"] / 30) * 0.5) * num_courts
    flat_cost = flat_hours * hourly_rate
    savings = flat_cost - result["total_cost"]
    print(f"Comparison: Flat booking all {num_courts} courts for entire day costs ${flat_cost:.2f}.")
    if savings > 0:
        print(f"💡 Early de-ramping saves: ${savings:.2f}!")

    # 6. Output Match Timetable
    print("\n" + "=" * 85)
    print(f"📋 MATCH TIMETABLE ({selected_format_label.upper()})")
    print("=" * 85)
    print(f"{'Time Window':<22} | {'Court':<8} | {'Stage':<10} | {'Match ID':<16} | {'Matchup'}")
    print("-" * 85)

    match_lookup = {m.id: m for m in matches}
    current_round = None

    for item in result["schedule"]:
        round_key = f"{item['stage']} R{item['round_num']}"
        if round_key != current_round:
            if current_round is not None:
                print("-" * 85)
            current_round = round_key

        start_str = format_time(tournament_start, item["start_minute"])
        end_str = format_time(tournament_start, item["end_minute"])
        time_window = f"{start_str} - {end_str}"

        m = match_lookup[item["match_id"]]
        matchup = f"{m.player1_id} vs {m.player2_id}"

        print(f"{time_window:<22} | {item['court_id']:<8} | {item['stage']:<10} | {item['match_id']:<16} | {matchup}")


if __name__ == "__main__":
    main()