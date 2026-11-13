import uuid

from app.core.security import create_access_token
from app.db import models

API = "/api/v1"


def _organiser(db_session):
    organiser = models.User(
        name="Org", email=f"org-{id(db_session)}@example.com", role=models.UserRole.ORGANISER,
        pin_hash="x", is_approved=True,
    )
    db_session.add(organiser)
    db_session.commit()
    db_session.refresh(organiser)
    return organiser


def _token(user):
    return create_access_token({"sub": user.id, "role": user.role.value})


def _tournament(db_session, status=models.TournamentStatus.DRAFT, organiser_id=None):
    tournament = models.Tournament(
        name="Test Open", format=models.TournamentFormat.GROUP_KNOCKOUT, status=status, organiser_id=organiser_id,
    )
    db_session.add(tournament)
    db_session.commit()
    db_session.refresh(tournament)
    return tournament


def _player(db_session, tournament_id, name="Jane Doe", team_id=None):
    player = models.Player(id=f"P_{uuid.uuid4().hex[:8]}", tournament_id=tournament_id, name=name, team_id=team_id)
    db_session.add(player)
    db_session.commit()
    db_session.refresh(player)
    return player


def test_delete_player_with_no_fixtures_succeeds(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, organiser_id=org.id)
    player = _player(db_session, tournament.id)

    resp = client.delete(f"{API}/tournaments/{tournament.id}/players/{player.id}", headers=headers)
    assert resp.status_code == 200, resp.text
    assert db_session.query(models.Player).filter(models.Player.id == player.id).first() is None


def test_delete_player_blocked_once_they_have_a_fixture(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, status=models.TournamentStatus.SCHEDULING, organiser_id=org.id)
    player = _player(db_session, tournament.id)
    opponent = _player(db_session, tournament.id, name="Opponent")
    match = models.Match(
        tournament_id=tournament.id, stage=models.MatchStage.KNOCKOUT, round_num=1,
        player1_id=player.id, player2_id=opponent.id,
    )
    db_session.add(match)
    db_session.commit()

    resp = client.delete(f"{API}/tournaments/{tournament.id}/players/{player.id}", headers=headers)
    assert resp.status_code == 400, resp.text
    assert "withdraw" in resp.json()["detail"].lower()
    assert db_session.query(models.Player).filter(models.Player.id == player.id).first() is not None


def test_delete_player_blocked_once_tournament_in_progress(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, status=models.TournamentStatus.IN_PROGRESS, organiser_id=org.id)
    player = _player(db_session, tournament.id)

    resp = client.delete(f"{API}/tournaments/{tournament.id}/players/{player.id}", headers=headers)
    assert resp.status_code == 400, resp.text


def test_delete_player_clears_team_captaincy(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, organiser_id=org.id)
    team = models.TournamentTeam(tournament_id=tournament.id, name="Team A")
    db_session.add(team)
    db_session.flush()
    player = _player(db_session, tournament.id, team_id=team.id)
    team.captain_player_id = player.id
    db_session.commit()

    resp = client.delete(f"{API}/tournaments/{tournament.id}/players/{player.id}", headers=headers)
    assert resp.status_code == 200, resp.text
    db_session.refresh(team)
    assert team.captain_player_id is None


def test_delete_player_404_for_unknown_player(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, organiser_id=org.id)

    resp = client.delete(f"{API}/tournaments/{tournament.id}/players/nope", headers=headers)
    assert resp.status_code == 404, resp.text
