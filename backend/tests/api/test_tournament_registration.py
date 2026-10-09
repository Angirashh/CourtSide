import pytest

from app.core.security import create_access_token
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
    return client.post(
        f"{API}/auth/player/google/complete-signup",
        json={"signup_token": body["signup_token"], "phone": phone},
    )


def _create_tournament(db_session, **kwargs):
    tournament = models.Tournament(
        name="Test Open", format=models.TournamentFormat.GROUP_KNOCKOUT, status=models.TournamentStatus.DRAFT,
        **kwargs,
    )
    db_session.add(tournament)
    db_session.commit()
    db_session.refresh(tournament)
    return tournament


def _organiser_token(db_session):
    organiser = models.User(
        name="Org", email="org@example.com", role=models.UserRole.ORGANISER, pin_hash="x", is_approved=True
    )
    db_session.add(organiser)
    db_session.commit()
    return create_access_token({"sub": organiser.id, "role": organiser.role.value})


def test_new_tournament_row_defaults_registration_open(db_session):
    """Backward compatibility: every tournament row created before this flag existed behaved as
    always-open at DRAFT/SCHEDULING -- the column default must preserve that for new raw rows
    too (the API's own default is NOT_OPEN; see TournamentBase.registration_status)."""
    tournament = _create_tournament(db_session)
    assert tournament.registration_status == models.RegistrationStatus.OPEN
    assert tournament.max_players is None


def test_organiser_can_cycle_registration_status_and_set_capacity(client, db_session):
    tournament = _create_tournament(db_session)
    token = _organiser_token(db_session)

    resp = client.patch(
        f"{API}/tournaments/{tournament.id}",
        json={"registration_status": "CLOSED", "max_players": 16},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["registration_status"] == "CLOSED"
    assert body["max_players"] == 16

    reopen = client.patch(
        f"{API}/tournaments/{tournament.id}",
        json={"registration_status": "OPEN"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert reopen.status_code == 200, reopen.text
    assert reopen.json()["registration_status"] == "OPEN"
    # max_players must not have been reset by the follow-up PATCH that did not mention it.
    assert reopen.json()["max_players"] == 16


def test_public_summary_exposes_registration_fields(client, db_session):
    _create_tournament(db_session, registration_status=models.RegistrationStatus.NOT_OPEN, max_players=8)

    resp = client.get(f"{API}/public/tournaments")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 1
    assert body[0]["registration_status"] == "NOT_OPEN"
    assert body[0]["max_players"] == 8


def test_self_register_blocked_when_not_open_yet(client, db_session, mock_phone_verify):
    tournament = _create_tournament(db_session, registration_status=models.RegistrationStatus.NOT_OPEN)
    token = _signup(client, "9000000001", "a@example.com").json()["access_token"]

    resp = client.post(
        f"{API}/tournaments/{tournament.id}/players/self-register",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
    assert "hasn't opened" in resp.json()["detail"].lower()


def test_self_register_blocked_when_closed_by_organiser(client, db_session, mock_phone_verify):
    tournament = _create_tournament(db_session, registration_status=models.RegistrationStatus.CLOSED)
    token = _signup(client, "9000000002", "b@example.com").json()["access_token"]

    resp = client.post(
        f"{API}/tournaments/{tournament.id}/players/self-register",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
    assert "closed" in resp.json()["detail"].lower()


def test_self_register_blocked_once_capacity_reached(client, db_session, mock_phone_verify):
    tournament = _create_tournament(db_session, max_players=1)

    first_token = _signup(client, "9000000003", "c@example.com").json()["access_token"]
    first = client.post(
        f"{API}/tournaments/{tournament.id}/players/self-register",
        headers={"Authorization": f"Bearer {first_token}"},
    )
    assert first.status_code == 201, first.text

    db_session.refresh(tournament)
    assert tournament.registration_status == models.RegistrationStatus.CLOSED, (
        "reaching the roster cap must auto-close registration"
    )

    second_token = _signup(client, "9000000004", "d@example.com").json()["access_token"]
    second = client.post(
        f"{API}/tournaments/{tournament.id}/players/self-register",
        headers={"Authorization": f"Bearer {second_token}"},
    )
    assert second.status_code == 400
    assert "full" in second.json()["detail"].lower()


def test_self_register_allowed_under_capacity(client, db_session, mock_phone_verify):
    tournament = _create_tournament(db_session, max_players=2)
    token = _signup(client, "9000000005", "e@example.com").json()["access_token"]

    resp = client.post(
        f"{API}/tournaments/{tournament.id}/players/self-register",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text


def test_organiser_adding_player_also_auto_closes_at_capacity(client, db_session):
    tournament = _create_tournament(db_session, max_players=1)
    token = _organiser_token(db_session)

    resp = client.post(
        f"{API}/tournaments/{tournament.id}/players",
        json={"name": "Walk-in Player"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text

    db_session.refresh(tournament)
    assert tournament.registration_status == models.RegistrationStatus.CLOSED
