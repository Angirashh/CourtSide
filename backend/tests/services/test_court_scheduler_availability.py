from app.services.fixture_engine.datatypes import Match, MatchStage
from app.services.scheduling_engine.cp_sat_solver import CourtScheduler


def _matches(n):
    """n independent 1v1 matches, no round dependencies, so the solver is free to place any
    match on any court at any time — isolating the effect of court_available_from."""
    return [
        Match(id=f"M{i}", round_num=1, stage=MatchStage.GROUP, player1_id=f"P{2*i}", player2_id=f"P{2*i+1}")
        for i in range(n)
    ]


def test_no_available_from_behaves_as_before():
    result = CourtScheduler.schedule_matches(
        matches=_matches(8), num_courts=4, match_duration=15, rest_time=10, court_hourly_cost=100
    )
    assert result["status"] in ("OPTIMAL", "FEASIBLE")
    starts_by_court = {}
    for item in result["schedule"]:
        starts_by_court.setdefault(item["court_id"], []).append(item["start_minute"])
    assert all(min(starts) == 0 for starts in starts_by_court.values())


def test_court_available_from_floors_that_courts_matches():
    # Court_4 doesn't open until minute 30; the other three are free from minute 0. Enough
    # matches that using all 4 courts is actually worth it (otherwise the solver would just
    # skip the late court entirely, which wouldn't test anything).
    result = CourtScheduler.schedule_matches(
        matches=_matches(16), num_courts=4, match_duration=15, rest_time=10, court_hourly_cost=100,
        court_available_from={4: 30},
    )
    assert result["status"] in ("OPTIMAL", "FEASIBLE")

    starts_by_court = {}
    for item in result["schedule"]:
        starts_by_court.setdefault(item["court_id"], []).append(item["start_minute"])

    assert min(starts_by_court["Court_4"]) >= 30
    # The other courts aren't held back by Court_4's late opening, and still start at 0 — proving
    # the floor is per-court, not a global shift.
    for court_id in ("Court_1", "Court_2", "Court_3"):
        if court_id in starts_by_court:
            assert min(starts_by_court[court_id]) == 0

    # The booking window reported for Court_4 also respects the floor — it never claims to be
    # booked before it actually opens.
    if "Court_4" in result["court_bookings"]:
        assert result["court_bookings"]["Court_4"]["booked_from_minute"] >= 30


def test_court_available_from_never_causes_a_match_before_the_floor_even_when_court_is_only_one_used():
    # A single court that's late-opening still can't be scheduled earlier than its floor, even
    # though it's the only option for every match.
    result = CourtScheduler.schedule_matches(
        matches=_matches(3), num_courts=1, match_duration=15, rest_time=10, court_hourly_cost=100,
        court_available_from={1: 45},
    )
    assert result["status"] in ("OPTIMAL", "FEASIBLE")
    assert all(item["start_minute"] >= 45 for item in result["schedule"])
