from app.services.fixture_engine.generators.swiss import SwissPairingGenerator

def test_swiss_first_round(generate_players):
    players = generate_players(8)
    matches = SwissPairingGenerator.generate_round_pairings(players, round_num=1)
    
    assert len(matches) == 4
    assert all(not m.is_bye for m in matches)

def test_swiss_prevents_rematches(generate_players):
    players = generate_players(4)
    
    # Simulate that P1 has already played P2
    players[0].opponents_played.add("P2")
    players[1].opponents_played.add("P1")
    
    # Give them identical scores to test if the algorithm forces them together
    for p in players:
        p.points = 1.0 
        
    matches = SwissPairingGenerator.generate_round_pairings(players, round_num=2)
    
    # Verify P1 is NOT paired with P2 despite having the same score
    for m in matches:
        pair = {m.player1_id, m.player2_id}
        assert pair != {"P1", "P2"}, "Rematch penalty failed!"