from datetime import datetime
from types import SimpleNamespace as NS

from app.db import models
from app.services.court_queues import build_court_queues

S, LIVE, DONE = models.MatchStatus.SCHEDULED, models.MatchStatus.IN_PROGRESS, models.MatchStatus.COMPLETED


def match(mid, court, status, hour, p1="P1", p2="P2", **kw):
    return NS(
        id=mid, stage=models.MatchStage.GROUP, round_num=1, court_id=court, status=status,
        scheduled_start_time=datetime(2026, 10, 10, hour), player1_id=p1, player2_id=p2,
        is_completed=status == DONE, is_bye=False, is_walkover=False, **kw,
    )


def tournament(matches, courts=("C1", "C2", "C10")):
    return NS(
        courts=[NS(id=c, name=f"Court {c[1:]}") for c in courts],
        players=[NS(id="P1", name="Asha", is_placeholder=False), NS(id="P2", name="TBD_R1_M1_Win", is_placeholder=True)],
        matches=matches,
    )


def test_courts_without_live_or_upcoming_matches_are_omitted():
    t = tournament([match("a", "C1", LIVE, 9), match("b", "C2", DONE, 9)])
    assert [q.court_name for q in build_court_queues(t)] == ["Court 1"]


def test_live_match_takes_the_slot_over_upcoming_and_courts_sort_naturally():
    t = tournament([match("late", "C10", S, 12), match("up", "C2", S, 11), match("live", "C2", LIVE, 13)])
    queues = build_court_queues(t)
    assert [q.court_name for q in queues] == ["Court 2", "Court 10"]
    assert [m.id for m in queues[0].matches] == ["live"]
    assert queues[0].more_upcoming == 1


def test_only_one_match_shown_per_court_next_scheduled_when_none_live():
    t = tournament([match(f"m{i}", "C1", S, 9 + i) for i in range(3)])
    (q,) = build_court_queues(t)
    assert [m.id for m in q.matches] == ["m0"]
    assert q.more_upcoming == 2


def test_byes_walkovers_and_unassigned_matches_are_ignored():
    bye, walkover = match("bye", "C1", S, 9), match("wo", "C1", S, 10)
    bye.is_bye, walkover.is_walkover = True, True
    t = tournament([bye, walkover, match("nocourt", None, S, 11)])
    assert build_court_queues(t) == []


def test_placeholder_players_are_flagged():
    (q,) = build_court_queues(tournament([match("a", "C1", S, 9)]))
    m = q.matches[0]
    assert (m.player1_name, m.player1_is_placeholder) == ("Asha", False)
    assert m.player2_is_placeholder is True
