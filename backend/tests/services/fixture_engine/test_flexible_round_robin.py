import pytest
from app.services.fixture_engine.datatypes import MatchStage
from app.services.fixture_engine.generators.flexible_round_robin import FlexibleRoundRobinGenerator
from app.services.fixture_engine.generators.team_friendly import InfeasibleQuotaError


def test_quota_matches_give_every_player_exact_count(generate_players):
    players = generate_players(9)
    matches = FlexibleRoundRobinGenerator.generate_quota_matches(players, matches_per_player=4)

    assert len(matches) == (9 * 4) // 2
    assert all(m.stage == MatchStage.ROUND_ROBIN for m in matches)
    assert all(m.round_num == 1 for m in matches)

    match_counts = {p.id: 0 for p in players}
    seen_pairs = set()
    for m in matches:
        match_counts[m.player1_id] += 1
        match_counts[m.player2_id] += 1
        pair = frozenset((m.player1_id, m.player2_id))
        assert pair not in seen_pairs, "no duplicate pairings allowed"
        seen_pairs.add(pair)

    assert all(count == 4 for count in match_counts.values())


def test_odd_total_quota_is_infeasible(generate_players):
    players = generate_players(9)
    with pytest.raises(InfeasibleQuotaError):
        FlexibleRoundRobinGenerator.generate_quota_matches(players, matches_per_player=3)


def test_quota_exceeding_available_opponents_is_infeasible(generate_players):
    players = generate_players(4)
    with pytest.raises(InfeasibleQuotaError):
        FlexibleRoundRobinGenerator.generate_quota_matches(players, matches_per_player=4)


def test_even_player_count_full_round_robin_quota(generate_players):
    players = generate_players(6)
    matches = FlexibleRoundRobinGenerator.generate_quota_matches(players, matches_per_player=5)

    assert len(matches) == 15
    match_counts = {p.id: 0 for p in players}
    for m in matches:
        match_counts[m.player1_id] += 1
        match_counts[m.player2_id] += 1
    assert all(count == 5 for count in match_counts.values())
