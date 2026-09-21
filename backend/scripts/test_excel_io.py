import os
import uuid
import pandas as pd
from app.services.fixture_engine.datatypes import Player
from app.services.fixture_engine.fixture_engine import FixtureEngine


def create_sample_input_file(filepath: str):
    """Generates a dummy Excel file with 8 badminton players."""
    sample_data = {
        "player_id": [f"P{i}" for i in range(1, 9)],
        "player_name": [
            "Viktor Axelsen", "Lee Zii Jia", "Loh Kean Yew", "Kento Momota",
            "Shi Yuqi", "Anthony Ginting", "Jonatan Christie", "Lakshya Sen"
        ],
        "seed": [1, 2, 3, 4, 5, 6, 7, 8]
    }
    df = pd.DataFrame(sample_data)
    df.to_excel(filepath, index=False)
    print(f"Created new sample input file at: {filepath}")


def _matches_to_dataframe(matches: list, name_lookup: dict, stage_label: str) -> pd.DataFrame:
    """Helper to convert a list of matches to a pandas DataFrame."""
    rows = []
    for m in matches:
        rows.append({
            "Stage": m.stage.value,
            "Group/Pool": m.group_id or stage_label,
            "Round": m.round_num,
            "Match ID": m.id,
            "Player 1": name_lookup.get(m.player1_id, m.player1_id),
            "Player 2": name_lookup.get(m.player2_id, "BYE") if m.player2_id else "BYE"
        })
    return pd.DataFrame(rows)


def generate_fixtures_from_excel(input_path: str, output_path: str):
    # 1. Check if input file exists
    if not os.path.exists(input_path):
        create_sample_input_file(input_path)
    else:
        print(f"Reading existing input file from: {input_path}")

    # 2. Read the Excel file
    df_players = pd.read_excel(input_path)

    players = []
    for _, row in df_players.iterrows():
        raw_id = row.get("player_id")
        player_id = str(raw_id) if pd.notna(raw_id) and str(raw_id).strip() else f"P-{uuid.uuid4().hex[:6]}"
        seed = int(row.get("seed", 999)) if pd.notna(row.get("seed")) else 999

        players.append(Player(
            id=player_id,
            name=str(row["player_name"]),
            seed=seed
        ))

    engine = FixtureEngine()
    name_lookup = {p.id: p.name for p in players}
    sheets_data = {}

    # --- FORMAT 1: GROUP STAGE ---
    group_fixtures = engine.setup_group_stage(players, num_groups=2)
    all_group_matches = []
    for pool_matches in group_fixtures.values():
        all_group_matches.extend(pool_matches)
    sheets_data["Group_Stage"] = _matches_to_dataframe(all_group_matches, name_lookup, "Groups")

    # --- FORMAT 2: KNOCKOUT STAGE ---
    # Sort players by seed before generating bracket
    sorted_players = sorted(players, key=lambda p: p.seed)
    knockout_matches = engine.generate_knockout_stage(sorted_players)
    sheets_data["Knockout_Stage"] = _matches_to_dataframe(knockout_matches, name_lookup, "Bracket")

    # --- FORMAT 3: SWISS STAGE (Simulating 2 Rounds) ---
    # Reset player states for Swiss simulation
    for p in players:
        p.points = 0
        p.opponents_played = set()
        p.received_bye = False

    swiss_r1 = engine.generate_swiss_round(players, round_num=1)
    
    # Simulate Round 1 Results (Player 1 always wins for testing)
    player_map = {p.id: p for p in players}
    for m in swiss_r1:
        if m.player2_id:
            winner = player_map[m.player1_id]
            loser = player_map[m.player2_id]
            winner.points += 1.0
            winner.opponents_played.add(loser.id)
            loser.opponents_played.add(winner.id)

    swiss_r2 = engine.generate_swiss_round(players, round_num=2)
    sheets_data["Swiss_Stage"] = _matches_to_dataframe(swiss_r1 + swiss_r2, name_lookup, "Swiss")


    # 3. Write all formats to the Excel Output
    mode = 'a' if os.path.exists(output_path) else 'w'
    if_sheet_exists = 'replace' if mode == 'a' else None

    with pd.ExcelWriter(output_path, engine='openpyxl', mode=mode, if_sheet_exists=if_sheet_exists) as writer:
        for sheet_name, df in sheets_data.items():
            df.to_excel(writer, sheet_name=sheet_name, index=False)

    print(f"✅ All formats (Group, Knockout, Swiss) exported successfully to tabs in: {output_path}")


if __name__ == "__main__":
    os.makedirs("scripts_output", exist_ok=True)
    input_file = "scripts_output/sample_players.xlsx"
    output_file = "scripts_output/generated_fixtures.xlsx"

    generate_fixtures_from_excel(input_file, output_file)