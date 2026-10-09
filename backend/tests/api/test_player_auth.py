import pytest

from app.core.security import create_access_token
from app.db import models

API = "/api/v1"


@pytest.fixture
def mock_google_verify(monkeypatch):
    """
    Stubs google_auth.verify_google_id_token so tests don't need a real Google token. The fake
    "id_token" a test sends is just "email|First Last" -- the stub splits it back apart into the
    profile fields the real endpoint would have gotten from Google.
    """
    def _fake_verify(id_token):
        email, _, name = id_token.partition("|")
        return {"email": email, "name": name or "Test Player", "email_verified": "true", "aud": "test-aud"}

    monkeypatch.setattr("app.api.routes_player_auth.verify_google_id_token", _fake_verify)


def _google_token(email: str, first_name: str = "Test", last_name: str = "Player") -> str:
    return f"{email}|{first_name} {last_name}".strip()


def _google_start(client, email="player@example.com", first_name="Test", last_name="Player"):
    return client.post(f"{API}/auth/player/google", json={"id_token": _google_token(email, first_name, last_name)})


def _signup(client, phone="9123456780", first_name="Test", last_name="Player", email="player@example.com"):
    start = _google_start(client, email, first_name, last_name)
    assert start.status_code == 200, start.text
    body = start.json()
    assert body["account_exists"] is False, "test setup expects a brand-new signup"
    return client.post(
        f"{API}/auth/player/google/complete-signup",
        json={"signup_token": body["signup_token"], "phone": phone},
    )


def _login(client, email="player@example.com"):
    return _google_start(client, email)


def _create_tournament(db_session, status=models.TournamentStatus.DRAFT):
    tournament = models.Tournament(
        name="Test Open", format=models.TournamentFormat.GROUP_KNOCKOUT, status=status
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


def test_signup_creates_user_and_athlete(client, db_session, mock_google_verify):
    resp = _signup(client)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["claimed_existing_record"] is False
    assert body["role"] == "PLAYER"

    user = db_session.query(models.User).filter(models.User.email == "player@example.com").first()
    assert user is not None
    assert user.role == models.UserRole.PLAYER
    assert user.phone == "+919123456780"
    assert user.first_name == "Test"
    assert user.last_name == "Player"
    assert user.athlete_id is not None

    athlete = db_session.query(models.Athlete).filter(models.Athlete.email == "player@example.com").first()
    assert athlete is not None
    assert athlete.id == user.athlete_id


def test_signup_claims_existing_organiser_added_athlete(client, db_session, mock_google_verify):
    tournament = _create_tournament(db_session)
    athlete = models.Athlete(name="Claimed Player", email="claimed@example.com")
    db_session.add(athlete)
    db_session.flush()
    db_session.add(models.Player(tournament_id=tournament.id, athlete_id=athlete.id, name="Claimed Player"))
    db_session.commit()

    resp = _signup(client, phone="9000000001", email="claimed@example.com")
    assert resp.status_code == 200, resp.text
    assert resp.json()["claimed_existing_record"] is True

    athletes = db_session.query(models.Athlete).filter(models.Athlete.email == "claimed@example.com").all()
    assert len(athletes) == 1

    user = db_session.query(models.User).filter(models.User.email == "claimed@example.com").first()
    assert user.athlete_id == athlete.id


def test_login_returning_user_reuses_same_account(client, db_session, mock_google_verify):
    first = _signup(client)
    first_user_id = first.json()["user"]["id"]

    second = _login(client)
    assert second.status_code == 200
    body = second.json()
    assert body["account_exists"] is True
    assert body["session"]["user"]["id"] == first_user_id

    users = db_session.query(models.User).filter(models.User.email == "player@example.com").all()
    assert len(users) == 1


def test_signup_duplicate_phone_rejected(client, db_session, mock_google_verify):
    _signup(client, email="first@example.com")
    resp = _signup(client, email="second@example.com")
    assert resp.status_code == 409


def test_google_auth_new_email_offers_signup_instead_of_logging_in(client, db_session, mock_google_verify):
    resp = _google_start(client, email="brand-new@example.com")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["account_exists"] is False
    assert body["session"] is None
    assert body["signup_token"]
    assert body["email"] == "brand-new@example.com"


def test_complete_signup_rejects_garbage_token(client, db_session, mock_google_verify):
    resp = client.post(
        f"{API}/auth/player/google/complete-signup", json={"signup_token": "not-a-real-token", "phone": "9123456780"}
    )
    assert resp.status_code == 400


def test_complete_signup_rejects_invalid_phone_format(client, db_session, mock_google_verify):
    start = _google_start(client, email="player@example.com")
    signup_token = start.json()["signup_token"]

    resp = client.post(
        f"{API}/auth/player/google/complete-signup", json={"signup_token": signup_token, "phone": "12345"}
    )
    assert resp.status_code == 422


def test_complete_signup_rejects_email_already_claimed_in_the_meantime(client, db_session, mock_google_verify):
    """Guards the race where the same Google identity's signup_token is replayed after an
    account for that email already exists (e.g. two tabs completing signup concurrently)."""
    start = _google_start(client, email="player@example.com")
    signup_token = start.json()["signup_token"]

    first_complete = client.post(
        f"{API}/auth/player/google/complete-signup", json={"signup_token": signup_token, "phone": "9123456780"}
    )
    assert first_complete.status_code == 200, first_complete.text

    replay = client.post(
        f"{API}/auth/player/google/complete-signup", json={"signup_token": signup_token, "phone": "9000000009"}
    )
    assert replay.status_code == 409


def test_self_register_requires_player_token(client, db_session):
    tournament = _create_tournament(db_session)

    no_token = client.post(f"{API}/tournaments/{tournament.id}/players/self-register")
    assert no_token.status_code in (401, 403)

    organiser_token = _organiser_token(db_session)
    organiser_resp = client.post(
        f"{API}/tournaments/{tournament.id}/players/self-register",
        headers={"Authorization": f"Bearer {organiser_token}"},
    )
    assert organiser_resp.status_code == 403


def test_self_register_duplicate_rejected(client, db_session, mock_google_verify):
    tournament = _create_tournament(db_session)
    token = _signup(client).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    first = client.post(f"{API}/tournaments/{tournament.id}/players/self-register", headers=headers)
    assert first.status_code == 201, first.text

    second = client.post(f"{API}/tournaments/{tournament.id}/players/self-register", headers=headers)
    assert second.status_code == 400


def test_self_register_blocked_once_tournament_in_progress(client, db_session, mock_google_verify):
    tournament = _create_tournament(db_session, status=models.TournamentStatus.IN_PROGRESS)
    token = _signup(client).json()["access_token"]

    resp = client.post(
        f"{API}/tournaments/{tournament.id}/players/self-register",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


def test_my_registrations_reflects_self_registration(client, db_session, mock_google_verify):
    tournament = _create_tournament(db_session)
    token = _signup(client).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    client.post(f"{API}/tournaments/{tournament.id}/players/self-register", headers=headers)

    resp = client.get(f"{API}/auth/player/registrations", headers=headers)
    assert resp.status_code == 200
    registrations = resp.json()
    assert len(registrations) == 1
    assert registrations[0]["tournament_id"] == tournament.id
    assert registrations[0]["is_withdrawn"] is False


def test_ending_tournament_populates_athlete_career_stats(client, db_session, mock_google_verify):
    tournament = _create_tournament(db_session, status=models.TournamentStatus.DRAFT)

    winner_token = _signup(client, phone="9000000001", email="winner@example.com").json()["access_token"]
    winner_user = db_session.query(models.User).filter(models.User.email == "winner@example.com").first()

    loser_token = _signup(client, phone="9000000002", email="loser@example.com").json()["access_token"]
    loser_user = db_session.query(models.User).filter(models.User.email == "loser@example.com").first()

    reg1 = client.post(
        f"{API}/tournaments/{tournament.id}/players/self-register",
        headers={"Authorization": f"Bearer {winner_token}"},
    )
    assert reg1.status_code == 201, reg1.text
    reg2 = client.post(
        f"{API}/tournaments/{tournament.id}/players/self-register",
        headers={"Authorization": f"Bearer {loser_token}"},
    )
    assert reg2.status_code == 201, reg2.text

    # Registration is only open pre-IN_PROGRESS; flip status directly to simulate a tournament
    # that has already been played out, without needing a full schedule-generation flow here.
    tournament.status = models.TournamentStatus.IN_PROGRESS
    db_session.commit()

    winner_player = db_session.query(models.Player).filter(models.Player.athlete_id == winner_user.athlete_id).first()
    loser_player = db_session.query(models.Player).filter(models.Player.athlete_id == loser_user.athlete_id).first()

    match = models.Match(
        tournament_id=tournament.id,
        stage=models.MatchStage.KNOCKOUT,
        round_num=1,
        player1_id=winner_player.id,
        player2_id=loser_player.id,
        winner_id=winner_player.id,
        is_completed=True,
    )
    db_session.add(match)
    db_session.commit()

    organiser_token = _organiser_token(db_session)
    end_resp = client.post(
        f"{API}/tournaments/{tournament.id}/end",
        headers={"Authorization": f"Bearer {organiser_token}"},
    )
    assert end_resp.status_code == 200, end_resp.text

    winner_athlete = db_session.query(models.Athlete).filter(models.Athlete.id == winner_user.athlete_id).first()
    loser_athlete = db_session.query(models.Athlete).filter(models.Athlete.id == loser_user.athlete_id).first()
    assert winner_athlete.tournaments_played == 1
    assert winner_athlete.matches_played == 1
    assert winner_athlete.matches_won == 1
    assert winner_athlete.matches_lost == 0
    assert loser_athlete.tournaments_played == 1
    assert loser_athlete.matches_played == 1
    assert loser_athlete.matches_won == 0
    assert loser_athlete.matches_lost == 1

    # Ending again is rejected and must not double-count the already-finalized stats.
    second_end = client.post(
        f"{API}/tournaments/{tournament.id}/end",
        headers={"Authorization": f"Bearer {organiser_token}"},
    )
    assert second_end.status_code == 400
    db_session.refresh(winner_athlete)
    assert winner_athlete.tournaments_played == 1
    assert winner_athlete.matches_played == 1


def test_my_athlete_profile_breaks_stats_down_by_category(client, db_session, mock_google_verify):
    player_token = _signup(client, email="category_player@example.com").json()["access_token"]
    player_user = db_session.query(models.User).filter(models.User.email == "category_player@example.com").first()
    organiser_token = _organiser_token(db_session)

    def _play_tournament(category, player_wins):
        tournament = models.Tournament(
            name=f"{category.value} Open", format=models.TournamentFormat.GROUP_KNOCKOUT,
            status=models.TournamentStatus.DRAFT, category=category,
        )
        db_session.add(tournament)
        db_session.commit()
        db_session.refresh(tournament)

        reg = client.post(
            f"{API}/tournaments/{tournament.id}/players/self-register",
            headers={"Authorization": f"Bearer {player_token}"},
        )
        assert reg.status_code == 201, reg.text

        opponent_athlete = models.Athlete(name="Opponent")
        db_session.add(opponent_athlete)
        db_session.flush()
        opponent_player = models.Player(tournament_id=tournament.id, athlete_id=opponent_athlete.id, name="Opponent")
        db_session.add(opponent_player)
        db_session.commit()

        tournament.status = models.TournamentStatus.IN_PROGRESS
        db_session.commit()

        player_row = db_session.query(models.Player).filter(
            models.Player.tournament_id == tournament.id, models.Player.athlete_id == player_user.athlete_id
        ).first()
        winner_id = player_row.id if player_wins else opponent_player.id
        db_session.add(models.Match(
            tournament_id=tournament.id, stage=models.MatchStage.KNOCKOUT, round_num=1,
            player1_id=player_row.id, player2_id=opponent_player.id, winner_id=winner_id, is_completed=True,
        ))
        db_session.commit()

        end_resp = client.post(f"{API}/tournaments/{tournament.id}/end", headers={"Authorization": f"Bearer {organiser_token}"})
        assert end_resp.status_code == 200, end_resp.text
        return tournament

    _play_tournament(models.TournamentCategory.CORPORATE, player_wins=True)
    _play_tournament(models.TournamentCategory.FRIENDLY, player_wins=False)

    resp = client.get(f"{API}/athletes/me", headers={"Authorization": f"Bearer {player_token}"})
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["tournaments_played"] == 2
    assert body["matches_won"] == 1
    assert body["matches_lost"] == 1

    by_category = {s["category"]: s for s in body["stats_by_category"]}
    assert by_category.keys() == {"CORPORATE", "FRIENDLY"}
    assert by_category["CORPORATE"]["matches_won"] == 1
    assert by_category["CORPORATE"]["matches_lost"] == 0
    assert by_category["CORPORATE"]["win_rate_percentage"] == 100.0
    assert by_category["FRIENDLY"]["matches_won"] == 0
    assert by_category["FRIENDLY"]["matches_lost"] == 1
    assert by_category["FRIENDLY"]["win_rate_percentage"] == 0.0

    history_categories = {h["tournament_name"]: h["category"] for h in body["history"]}
    assert history_categories["CORPORATE Open"] == "CORPORATE"
    assert history_categories["FRIENDLY Open"] == "FRIENDLY"


def test_my_athlete_profile_returns_stats_for_signed_in_player(client, db_session, mock_google_verify):
    token = _signup(client).json()["access_token"]
    resp = client.get(f"{API}/athletes/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tournaments_played"] == 0
    assert body["matches_played"] == 0
    assert body["win_rate_percentage"] == 0.0


def test_my_athlete_profile_rejects_non_player_token(client, db_session):
    organiser_token = _organiser_token(db_session)
    resp = client.get(f"{API}/athletes/me", headers={"Authorization": f"Bearer {organiser_token}"})
    assert resp.status_code == 403


def test_organiser_roster_shows_self_registered_player(client, db_session, mock_google_verify):
    tournament = _create_tournament(db_session)
    player_token = _signup(
        client, first_name="Rostered", last_name="Player", email="rostered@example.com"
    ).json()["access_token"]

    self_register = client.post(
        f"{API}/tournaments/{tournament.id}/players/self-register",
        headers={"Authorization": f"Bearer {player_token}"},
    )
    assert self_register.status_code == 201

    organiser_token = _organiser_token(db_session)
    roster = client.get(
        f"{API}/tournaments/{tournament.id}/players",
        headers={"Authorization": f"Bearer {organiser_token}"},
    )
    assert roster.status_code == 200
    names = [p["name"] for p in roster.json()]
    assert "Rostered Player" in names


# =====================================================================
# EMAIL CLAIM MIGRATION (existing prod players with a real phone + placeholder email)
# =====================================================================
def test_claim_email_updates_placeholder_email(client, db_session):
    athlete = models.Athlete(name="Legacy Player", phone="+919000000099")
    db_session.add(athlete)
    db_session.flush()
    user = models.User(
        name="Legacy Player", phone="+919000000099", email="placeholder-1@example.com",
        role=models.UserRole.PLAYER, athlete_id=athlete.id, is_approved=True,
    )
    db_session.add(user)
    db_session.commit()

    resp = client.post(f"{API}/auth/player/claim-email", json={"phone": "9000000099", "email": "real@example.com"})
    assert resp.status_code == 200, resp.text

    db_session.refresh(user)
    assert user.email == "real@example.com"


def test_claim_email_rejects_unknown_phone(client, db_session):
    resp = client.post(f"{API}/auth/player/claim-email", json={"phone": "9111111111", "email": "real@example.com"})
    assert resp.status_code == 404


def test_claim_email_rejects_email_already_taken(client, db_session):
    other = models.User(name="Other", email="taken@example.com", role=models.UserRole.PLAYER, is_approved=True)
    legacy = models.User(name="Legacy", phone="+919000000088", email="placeholder-2@example.com", role=models.UserRole.PLAYER, is_approved=True)
    db_session.add_all([other, legacy])
    db_session.commit()

    resp = client.post(f"{API}/auth/player/claim-email", json={"phone": "9000000088", "email": "taken@example.com"})
    assert resp.status_code == 409
