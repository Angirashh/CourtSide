import pytest

from app.core.config import settings
from app.core.security import create_access_token
from app.db import models

API = "/api/v1"


def _google_claims(email="player@example.com", sub="google-sub-1", name="Test Player", email_verified=True):
    return {"email": email, "email_verified": email_verified, "sub": sub, "name": name}


@pytest.fixture
def mock_google(monkeypatch):
    """Returns a setter that makes the next verify_oauth2_token call return the given claims
    (or raise ValueError when claims is None) — avoids needing a real Google-signed JWT.
    Also stubs in a non-empty GOOGLE_CLIENT_ID: these tests must not depend on a real
    backend/.env being present (it isn't, in CI or a fresh checkout), since the endpoint
    itself refuses to even try verification when that setting is unset."""
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id")
    state = {"claims": _google_claims()}

    def _verify(id_token, request, audience):
        if state["claims"] is None:
            raise ValueError("invalid token")
        return state["claims"]

    monkeypatch.setattr("app.api.routes_player_auth.google_id_token.verify_oauth2_token", _verify)

    def _set(claims):
        state["claims"] = claims

    return _set


def _google_login(client, **claim_overrides):
    return client.post(f"{API}/auth/player/google", json={"id_token": "fake-token"})


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


def test_google_login_fresh_creates_user_and_athlete(client, db_session, mock_google):
    resp = _google_login(client)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["claimed_existing_record"] is False
    assert body["role"] == "PLAYER"

    user = db_session.query(models.User).filter(models.User.email == "player@example.com").first()
    assert user is not None
    assert user.role == models.UserRole.PLAYER
    assert user.google_sub == "google-sub-1"
    assert user.athlete_id is not None

    athlete = db_session.query(models.Athlete).filter(models.Athlete.email == "player@example.com").first()
    assert athlete is not None
    assert athlete.id == user.athlete_id


def test_google_login_claims_existing_organiser_added_athlete(client, db_session, mock_google):
    tournament = _create_tournament(db_session)
    athlete = models.Athlete(name="Claimed Player", email="claimed@example.com")
    db_session.add(athlete)
    db_session.flush()
    db_session.add(models.Player(tournament_id=tournament.id, athlete_id=athlete.id, name="Claimed Player"))
    db_session.commit()

    mock_google(_google_claims(email="claimed@example.com", sub="google-sub-claimed", name="Claimed Player"))
    resp = _google_login(client)
    assert resp.status_code == 200, resp.text
    assert resp.json()["claimed_existing_record"] is True

    athletes = db_session.query(models.Athlete).filter(models.Athlete.email == "claimed@example.com").all()
    assert len(athletes) == 1

    user = db_session.query(models.User).filter(models.User.email == "claimed@example.com").first()
    assert user.athlete_id == athlete.id


def test_google_login_returning_user_reuses_same_account(client, db_session, mock_google):
    first = _google_login(client)
    first_user_id = first.json()["user"]["id"]

    second = _google_login(client)
    assert second.status_code == 200
    assert second.json()["user"]["id"] == first_user_id
    assert second.json()["claimed_existing_record"] is False

    users = db_session.query(models.User).filter(models.User.email == "player@example.com").all()
    assert len(users) == 1


def test_google_login_rejects_unverified_email(client, db_session, mock_google):
    mock_google(_google_claims(email_verified=False))
    resp = _google_login(client)
    assert resp.status_code == 400


def test_google_login_invalid_token_rejected(client, db_session, mock_google):
    mock_google(None)
    resp = _google_login(client)
    assert resp.status_code == 401


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


def test_self_register_duplicate_rejected(client, db_session, mock_google):
    tournament = _create_tournament(db_session)
    token = _google_login(client).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    first = client.post(f"{API}/tournaments/{tournament.id}/players/self-register", headers=headers)
    assert first.status_code == 201, first.text

    second = client.post(f"{API}/tournaments/{tournament.id}/players/self-register", headers=headers)
    assert second.status_code == 400


def test_self_register_blocked_once_tournament_in_progress(client, db_session, mock_google):
    tournament = _create_tournament(db_session, status=models.TournamentStatus.IN_PROGRESS)
    token = _google_login(client).json()["access_token"]

    resp = client.post(
        f"{API}/tournaments/{tournament.id}/players/self-register",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


def test_my_registrations_reflects_self_registration(client, db_session, mock_google):
    tournament = _create_tournament(db_session)
    token = _google_login(client).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    client.post(f"{API}/tournaments/{tournament.id}/players/self-register", headers=headers)

    resp = client.get(f"{API}/auth/player/registrations", headers=headers)
    assert resp.status_code == 200
    registrations = resp.json()
    assert len(registrations) == 1
    assert registrations[0]["tournament_id"] == tournament.id
    assert registrations[0]["is_withdrawn"] is False


def test_ending_tournament_populates_athlete_career_stats(client, db_session, mock_google):
    tournament = _create_tournament(db_session, status=models.TournamentStatus.DRAFT)

    mock_google(_google_claims(email="winner@example.com", sub="google-sub-winner", name="Winner"))
    winner_token = _google_login(client).json()["access_token"]
    winner_user = db_session.query(models.User).filter(models.User.email == "winner@example.com").first()

    mock_google(_google_claims(email="loser@example.com", sub="google-sub-loser", name="Loser"))
    loser_token = _google_login(client).json()["access_token"]
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


def test_my_athlete_profile_breaks_stats_down_by_category(client, db_session, mock_google):
    mock_google(_google_claims(email="category_player@example.com", sub="google-sub-category", name="Category Player"))
    player_token = _google_login(client).json()["access_token"]
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


def test_my_athlete_profile_returns_stats_for_signed_in_player(client, db_session, mock_google):
    token = _google_login(client).json()["access_token"]
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


def test_organiser_roster_shows_self_registered_player(client, db_session, mock_google):
    tournament = _create_tournament(db_session)
    mock_google(_google_claims(email="rostered@example.com", sub="google-sub-rostered", name="Rostered Player"))
    player_token = _google_login(client).json()["access_token"]

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
