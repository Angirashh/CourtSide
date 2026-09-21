from app.services.fixture_engine.generators.knockout import KnockoutGenerator

def test_knockout_perfect_bracket(generate_players):
    players = generate_players(8)  # Power of 2
    round_1 = KnockoutGenerator.generate_bracket(players, start_round_num=1)
    
    assert len(round_1) == 4
    assert all(not m.is_bye for m in round_1)
    
    # Verify Seed 1 plays Seed 8 in Match 1
    assert round_1[0].player1_id == "P1"
    assert round_1[0].player2_id == "P8"

def test_knockout_with_byes(generate_players):
    players = generate_players(6)  # Not a power of 2
    round_1 = KnockoutGenerator.generate_bracket(players, start_round_num=1)
    
    # A 6-player bracket needs 8 slots -> 2 Byes for Seeds 1 and 2
    assert len(round_1) == 4
    
    byes = [m for m in round_1 if m.is_bye]
    assert len(byes) == 2
    
    # Seed 1 and Seed 2 should automatically win their bye matches
    assert byes[0].winner_id == "P1"
    assert byes[1].winner_id == "P2"