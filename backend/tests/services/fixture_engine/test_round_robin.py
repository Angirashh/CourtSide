from app.services.fixture_engine.generators.round_robin import RoundRobinGenerator

def test_round_robin_even_players(generate_players):
    players = generate_players(4)  # 4 players
    matches = RoundRobinGenerator.generate_group_fixtures(players, "Group_A")
    
    # Math check: N=4 players -> N(N-1)/2 = 6 total matches
    assert len(matches) == 6
    
    # Ensure no byes were generated
    assert all(not m.is_bye for m in matches)
    
    # Ensure every player plays exactly 3 times
    match_counts = {p.id: 0 for p in players}
    for m in matches:
        match_counts[m.player1_id] += 1
        match_counts[m.player2_id] += 1
        
    assert all(count == 3 for count in match_counts.values())

def test_round_robin_odd_players_has_byes(generate_players):
    players = generate_players(5)  # 5 players
    matches = RoundRobinGenerator.generate_group_fixtures(players, "Group_A")
    
    # 5 rounds * (2 matches + 1 bye) = 15 total records
    byes = [m for m in matches if m.is_bye]
    actual_matches = [m for m in matches if not m.is_bye]
    
    assert len(byes) == 5
    assert len(actual_matches) == 10