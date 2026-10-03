from datetime import datetime

import pytest

from app.core.security import create_access_token
from app.db import models

API = "/api/v1"


def _organiser_token(db_session):
    organiser = models.User(
        name="Org", email=f"org-{id(db_session)}@example.com", role=models.UserRole.ORGANISER,
        pin_hash="x", is_approved=True,
    )
    db_session.add(organiser)
    db_session.commit()
    return create_access_token({"sub": organiser.id, "role": organiser.role.value})


def _dt(s):
    return datetime.fromisoformat(s)


def _build_tournament(db_session, status=models.TournamentStatus.SCHEDULING):
    """
    Two courts, four players, a hand-placed schedule with exactly the configured 10-minute rest
    on P3's gap between Court A and Court B — enough slack to prove a small forward shift (which
    eats into that rest but doesn't cause a real overlap) is now allowed, while a bigger shift that
    actually overlaps two of a player's matches is still refused.
    """
    tournament = models.Tournament(
        name="T", format=models.TournamentFormat.GROUP_KNOCKOUT, status=status,
        match_duration_minutes=15, rest_time_minutes=10,
    )
    db_session.add(tournament)
    db_session.flush()

    court_a = models.Court(tournament_id=tournament.id, name="Court A", hourly_rate=100)
    court_b = models.Court(tournament_id=tournament.id, name="Court B", hourly_rate=100)
    db_session.add_all([court_a, court_b])
    db_session.flush()

    players = {name: models.Player(tournament_id=tournament.id, name=name) for name in ("P1", "P2", "P3", "P4")}
    db_session.add_all(players.values())
    db_session.flush()

    m1 = models.Match(
        tournament_id=tournament.id, stage=models.MatchStage.KNOCKOUT, round_num=1,
        player1_id=players["P1"].id, player2_id=players["P2"].id, court_id=court_a.id,
        scheduled_start_time=_dt("2026-01-01T09:00:00"), scheduled_end_time=_dt("2026-01-01T09:15:00"),
        status=models.MatchStatus.SCHEDULED,
    )
    m2 = models.Match(
        tournament_id=tournament.id, stage=models.MatchStage.KNOCKOUT, round_num=1,
        player1_id=players["P3"].id, player2_id=players["P4"].id, court_id=court_a.id,
        scheduled_start_time=_dt("2026-01-01T09:15:00"), scheduled_end_time=_dt("2026-01-01T09:30:00"),
        status=models.MatchStatus.SCHEDULED,
    )
    m3 = models.Match(
        tournament_id=tournament.id, stage=models.MatchStage.KNOCKOUT, round_num=2,
        player1_id=players["P1"].id, player2_id=players["P3"].id, court_id=court_b.id,
        scheduled_start_time=_dt("2026-01-01T09:40:00"), scheduled_end_time=_dt("2026-01-01T09:55:00"),
        status=models.MatchStatus.SCHEDULED,
    )
    db_session.add_all([m1, m2, m3])
    db_session.commit()
    return tournament, court_a, court_b, (m1, m2, m3)


def test_reschedule_shifts_matches_and_booking_when_no_conflict(client, db_session):
    tournament, court_a, _, (m1, m2, _) = _build_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}

    resp = client.patch(
        f"{API}/tournaments/{tournament.id}/courts/{court_a.id}/reschedule",
        json={"new_start_time": "2026-01-01T08:55:00"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["delta_minutes"] == -5
    assert body["shifted_matches_count"] == 2
    # Booking window is billed in 30-min grid increments, same as schedule generation — 08:55
    # rounds down to 08:30.
    assert body["booking"]["booked_from"].startswith("2026-01-01T08:30:00")

    db_session.refresh(m1)
    db_session.refresh(m2)
    assert m1.scheduled_start_time == _dt("2026-01-01T08:55:00")
    assert m2.scheduled_start_time == _dt("2026-01-01T09:10:00")


def test_reschedule_allows_shift_that_only_eats_into_rest_time(client, db_session):
    """Shifting Court A by +5 shrinks P3's gap to Court B from 10 min to 5 min — no longer blocked,
    since the rest-time cushion is deliberately not enforced on a manual court-timing edit."""
    tournament, court_a, _, (m1, m2, m3) = _build_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}

    resp = client.patch(
        f"{API}/tournaments/{tournament.id}/courts/{court_a.id}/reschedule",
        json={"new_start_time": "2026-01-01T09:05:00"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["delta_minutes"] == 5

    db_session.refresh(m1)
    db_session.refresh(m2)
    assert m1.scheduled_start_time == _dt("2026-01-01T09:05:00")
    assert m2.scheduled_start_time == _dt("2026-01-01T09:20:00")


def test_reschedule_rejects_shift_that_double_books_a_player(client, db_session):
    """Shifting Court A by +15 pushes M2 (09:30-09:45) into genuine overlap with M3 (09:40-09:55)
    for P3 — a real double-booking, which stays blocked regardless of rest time."""
    tournament, court_a, _, (m1, m2, m3) = _build_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}

    resp = client.patch(
        f"{API}/tournaments/{tournament.id}/courts/{court_a.id}/reschedule",
        json={"new_start_time": "2026-01-01T09:15:00"},
        headers=headers,
    )
    assert resp.status_code == 409
    assert "double-book" in resp.json()["detail"].lower()
    assert "P3" in resp.json()["detail"]

    # Nothing persisted on failure.
    db_session.refresh(m1)
    db_session.refresh(m2)
    db_session.refresh(m3)
    assert m1.scheduled_start_time == _dt("2026-01-01T09:00:00")
    assert m2.scheduled_start_time == _dt("2026-01-01T09:15:00")


def test_reschedule_rejects_before_schedule_exists(client, db_session):
    tournament, court_a, _, _ = _build_tournament(db_session, status=models.TournamentStatus.DRAFT)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}

    resp = client.patch(
        f"{API}/tournaments/{tournament.id}/courts/{court_a.id}/reschedule",
        json={"new_start_time": "2026-01-01T08:55:00"},
        headers=headers,
    )
    assert resp.status_code == 400


def test_reschedule_rejects_court_with_no_upcoming_matches(client, db_session):
    tournament, _, court_b, (_, _, m3) = _build_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}
    m3.status = models.MatchStatus.COMPLETED
    db_session.commit()

    resp = client.patch(
        f"{API}/tournaments/{tournament.id}/courts/{court_b.id}/reschedule",
        json={"new_start_time": "2026-01-01T10:00:00"},
        headers=headers,
    )
    assert resp.status_code == 400
