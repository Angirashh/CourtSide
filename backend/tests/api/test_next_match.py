from datetime import datetime

import pytest

from app.db import models

API = "/api/v1"


@pytest.fixture
def mock_phone_verify(monkeypatch):
    """Stubs google_auth.verify_google_id_token so tests don't need a real Google token. The fake
    "id_token" a test sends is just the email -- the stub turns that into a verified profile."""
    def _fake_verify(id_token):
        return {"email": id_token, "name": "Test Player", "email_verified": "true", "aud": "test-aud"}

    monkeypatch.setattr("app.api.routes_player_auth.verify_google_id_token", _fake_verify)


def _signup(client, phone, email):
    start = client.post(f"{API}/auth/player/google", json={"id_token": email})
    assert start.status_code == 200, start.text
    body = start.json()
    assert body["account_exists"] is False, "test setup expects a brand-new signup"
    resp = client.post(
        f"{API}/auth/player/google/complete-signup",
        json={"signup_token": body["signup_token"], "phone": phone},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _dt(s):
    return datetime.fromisoformat(s)


def _build_tournament(db_session, email, status=models.TournamentStatus.IN_PROGRESS):
    """One IN_PROGRESS tournament, two courts, and "Me" (linked to the athlete behind `email`)
    plus two opponents. No matches yet -- each test adds exactly the matches it needs."""
    tournament = models.Tournament(
        name="T", format=models.TournamentFormat.GROUP_KNOCKOUT, status=status,
    )
    db_session.add(tournament)
    db_session.flush()

    court_a = models.Court(tournament_id=tournament.id, name="Court A", hourly_rate=100)
    court_b = models.Court(tournament_id=tournament.id, name="Court B", hourly_rate=100)
    db_session.add_all([court_a, court_b])
    db_session.flush()

    athlete = db_session.query(models.Athlete).filter(models.Athlete.email == email).first()
    me = models.Player(tournament_id=tournament.id, name="Me", athlete_id=athlete.id)
    opp1 = models.Player(tournament_id=tournament.id, name="Opponent One")
    opp2 = models.Player(tournament_id=tournament.id, name="Opponent Two")
    db_session.add_all([me, opp1, opp2])
    db_session.flush()

    return tournament, (court_a, court_b), (me, opp1, opp2)


def test_scheduled_match_is_returned_with_court_opponent_and_round_label(client, db_session, mock_phone_verify):
    token = _signup(client, "9100000001", "next1@example.com")
    tournament, (court_a, _), (me, opp1, _) = _build_tournament(db_session, "next1@example.com")

    match = models.Match(
        tournament_id=tournament.id, stage=models.MatchStage.KNOCKOUT, round_num=1,
        player1_id=me.id, player2_id=opp1.id, court_id=court_a.id,
        scheduled_start_time=_dt("2026-01-01T09:00:00"), status=models.MatchStatus.SCHEDULED,
    )
    db_session.add(match)
    db_session.commit()

    resp = client.get(
        f"{API}/tournaments/{tournament.id}/players/me/next-match",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["match_id"] == match.id
    assert body["opponent_name"] == "Opponent One"
    assert body["opponent_is_placeholder"] is False
    assert body["court_name"] == "Court A"
    assert body["status"] == "SCHEDULED"
    assert body["scheduled_start_time"].startswith("2026-01-01T09:00:00")


def test_in_progress_match_outranks_a_later_scheduled_one(client, db_session, mock_phone_verify):
    token = _signup(client, "9100000002", "next2@example.com")
    tournament, (court_a, court_b), (me, opp1, opp2) = _build_tournament(db_session, "next2@example.com")

    live = models.Match(
        tournament_id=tournament.id, stage=models.MatchStage.KNOCKOUT, round_num=1,
        player1_id=me.id, player2_id=opp1.id, court_id=court_a.id,
        scheduled_start_time=_dt("2026-01-01T09:00:00"), status=models.MatchStatus.IN_PROGRESS,
    )
    # Earlier scheduled_start_time but not the live one -- live must still win.
    upcoming = models.Match(
        tournament_id=tournament.id, stage=models.MatchStage.KNOCKOUT, round_num=2,
        player1_id=me.id, player2_id=opp2.id, court_id=court_b.id,
        scheduled_start_time=_dt("2026-01-01T08:00:00"), status=models.MatchStatus.SCHEDULED,
    )
    db_session.add_all([live, upcoming])
    db_session.commit()

    resp = client.get(
        f"{API}/tournaments/{tournament.id}/players/me/next-match",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["match_id"] == live.id
    assert body["status"] == "IN_PROGRESS"


def test_placeholder_opponent_is_flagged_for_client_prettification(client, db_session, mock_phone_verify):
    token = _signup(client, "9100000003", "next3@example.com")
    tournament, (court_a, _), (me, _, _) = _build_tournament(db_session, "next3@example.com")
    tbd = models.Player(tournament_id=tournament.id, name="TBD_R2_M1_Win", is_placeholder=True)
    db_session.add(tbd)
    db_session.flush()

    match = models.Match(
        tournament_id=tournament.id, stage=models.MatchStage.KNOCKOUT, round_num=2,
        player1_id=me.id, player2_id=tbd.id, court_id=court_a.id,
        status=models.MatchStatus.SCHEDULED,
    )
    db_session.add(match)
    db_session.commit()

    resp = client.get(
        f"{API}/tournaments/{tournament.id}/players/me/next-match",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["opponent_name"] == "TBD_R2_M1_Win"
    assert body["opponent_is_placeholder"] is True


def test_returns_null_when_not_registered_in_this_tournament(client, db_session, mock_phone_verify):
    token = _signup(client, "9100000004", "next4@example.com")
    # No Player row links back to this athlete -- an empty tournament is enough to prove it.
    tournament = models.Tournament(name="Empty", format=models.TournamentFormat.GROUP_KNOCKOUT, status=models.TournamentStatus.IN_PROGRESS)
    db_session.add(tournament)
    db_session.commit()

    resp = client.get(
        f"{API}/tournaments/{tournament.id}/players/me/next-match",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() is None


def test_returns_null_once_every_match_is_completed(client, db_session, mock_phone_verify):
    token = _signup(client, "9100000005", "next5@example.com")
    tournament, (court_a, _), (me, opp1, _) = _build_tournament(db_session, "next5@example.com")

    match = models.Match(
        tournament_id=tournament.id, stage=models.MatchStage.KNOCKOUT, round_num=1,
        player1_id=me.id, player2_id=opp1.id, court_id=court_a.id,
        status=models.MatchStatus.COMPLETED, is_completed=True, winner_id=opp1.id,
    )
    db_session.add(match)
    db_session.commit()

    resp = client.get(
        f"{API}/tournaments/{tournament.id}/players/me/next-match",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() is None
