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


def test_patch_me_requires_auth(client):
    resp = client.patch(f"{API}/athletes/me", json={"gender": "MALE"})
    assert resp.status_code == 401, resp.text


def test_patch_me_updates_profile_fields(client, mock_phone_verify):
    token = _signup(client, "9200000001", "profile1@example.com")

    resp = client.patch(
        f"{API}/athletes/me",
        json={
            "gender": "FEMALE",
            "dominant_hand": "LEFT",
            "preferred_formats": ["SINGLES", "DOUBLES"],
            "bio": "Loves a good smash.",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["gender"] == "FEMALE"
    assert body["dominant_hand"] == "LEFT"
    assert body["preferred_formats"] == ["SINGLES", "DOUBLES"]
    assert body["bio"] == "Loves a good smash."


def test_patch_me_clears_preferred_formats_with_empty_list(client, mock_phone_verify):
    token = _signup(client, "9200000004", "profile4@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    first = client.patch(f"{API}/athletes/me", json={"preferred_formats": ["SINGLES"]}, headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["preferred_formats"] == ["SINGLES"]

    cleared = client.patch(f"{API}/athletes/me", json={"preferred_formats": []}, headers=headers)
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["preferred_formats"] == []


def test_patch_me_rejects_invalid_enum_value(client, mock_phone_verify):
    token = _signup(client, "9200000002", "profile2@example.com")

    resp = client.patch(
        f"{API}/athletes/me",
        json={"gender": "ALIEN"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422, resp.text


def test_get_athlete_by_id_surfaces_profile_fields_without_auth(client, db_session, mock_phone_verify):
    token = _signup(client, "9200000003", "profile3@example.com")
    client.patch(
        f"{API}/athletes/me",
        json={"gender": "MALE", "dominant_hand": "RIGHT", "preferred_formats": ["SINGLES", "MIXED_DOUBLES"], "bio": "Right-handed singles player."},
        headers={"Authorization": f"Bearer {token}"},
    )

    athlete = db_session.query(models.Athlete).filter(models.Athlete.email == "profile3@example.com").first()

    # No Authorization header at all -- this is the "opponent/organiser looking someone up" path.
    resp = client.get(f"{API}/athletes/{athlete.id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["gender"] == "MALE"
    assert body["dominant_hand"] == "RIGHT"
    assert body["preferred_formats"] == ["SINGLES", "MIXED_DOUBLES"]
    assert body["bio"] == "Right-handed singles player."


def test_me_history_includes_per_tournament_win_rate(client, db_session, mock_phone_verify):
    token = _signup(client, "9200000006", "profile6@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    athlete_id = client.get(f"{API}/athletes/me", headers=headers).json()["id"]

    tournament = models.Tournament(
        name="History Open", format=models.TournamentFormat.KNOCKOUT, status=models.TournamentStatus.COMPLETED,
    )
    db_session.add(tournament)
    db_session.flush()

    me_player = models.Player(id="P_hist_me", tournament_id=tournament.id, name="Me", athlete_id=athlete_id)
    opp = models.Player(id="P_hist_opp", tournament_id=tournament.id, name="Opp")
    db_session.add_all([me_player, opp])
    db_session.flush()

    won_match = models.Match(
        id="M_hist_won", tournament_id=tournament.id, stage=models.MatchStage.KNOCKOUT, round_num=1,
        player1_id=me_player.id, player2_id=opp.id, winner_id=me_player.id, is_completed=True,
    )
    # A no-result match shouldn't count as played, same as the standings rule it mirrors.
    no_result_match = models.Match(
        id="M_hist_nr", tournament_id=tournament.id, stage=models.MatchStage.ROUND_ROBIN, round_num=1,
        player1_id=me_player.id, player2_id=opp.id, is_completed=True, is_no_result=True,
    )
    db_session.add_all([won_match, no_result_match])
    db_session.commit()

    resp = client.get(f"{API}/athletes/me", headers=headers)
    assert resp.status_code == 200, resp.text
    entry = next(h for h in resp.json()["history"] if h["tournament_id"] == tournament.id)
    assert entry["matches_played"] == 1
    assert entry["matches_won"] == 1
    assert entry["win_rate_percentage"] == 100.0


def test_create_athlete_requires_organiser_auth(client):
    resp = client.post(f"{API}/athletes", json={"name": "Anon Athlete"})
    assert resp.status_code == 401, resp.text


def test_create_athlete_allowed_for_organiser(client, db_session):
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}
    resp = client.post(f"{API}/athletes", json={"name": "Org Added Athlete"}, headers=headers)
    assert resp.status_code == 201, resp.text
    assert resp.json()["name"] == "Org Added Athlete"


def test_update_athlete_requires_organiser_auth(client, db_session, mock_phone_verify):
    """Regression guard: PATCH /{athlete_id} used to have zero auth, letting anyone rewrite
    a victim athlete's email/phone -- which _claim_or_create_athlete (routes_player_auth.py)
    would then match a brand-new Google signup onto, hijacking the victim's competitive
    record. This must now require organiser auth, same as the account-takeover-adjacent
    `PATCH /athletes/me` requires player auth."""
    _signup(client, "9200000005", "victim@example.com")
    victim = db_session.query(models.Athlete).filter(models.Athlete.email == "victim@example.com").first()

    resp = client.patch(f"{API}/athletes/{victim.id}", json={"email": "attacker@example.com"})
    assert resp.status_code == 401, resp.text

    db_session.refresh(victim)
    assert victim.email == "victim@example.com", "unauthenticated PATCH must not have changed the record"


def test_update_athlete_allowed_for_organiser(client, db_session, mock_phone_verify):
    _signup(client, "9200000006", "update-target@example.com")
    athlete = db_session.query(models.Athlete).filter(models.Athlete.email == "update-target@example.com").first()
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}

    resp = client.patch(f"{API}/athletes/{athlete.id}", json={"club_or_city": "Pune"}, headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["club_or_city"] == "Pune"
