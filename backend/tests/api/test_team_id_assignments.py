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


def _create_team_tournament(db_session):
    tournament = models.Tournament(
        name="Team Clash",
        format=models.TournamentFormat.KNOCKOUT,
        tournament_type=models.TournamentType.TEAM,
        status=models.TournamentStatus.DRAFT,
    )
    db_session.add(tournament)
    db_session.flush()

    team_a = models.TournamentTeam(tournament_id=tournament.id, name="Team A")
    team_b = models.TournamentTeam(tournament_id=tournament.id, name="Team B")
    db_session.add_all([team_a, team_b])
    db_session.flush()

    player = models.Player(tournament_id=tournament.id, name="Asha", seed=1)
    db_session.add(player)
    db_session.commit()
    db_session.refresh(tournament)
    db_session.refresh(player)
    db_session.refresh(team_a)
    return tournament, player, team_a, team_b


def test_assigns_player_to_team_by_team_id(client, db_session):
    tournament, player, team_a, _team_b = _create_team_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}

    resp = client.patch(
        f"{API}/tournaments/{tournament.id}/players/team-id-assignments",
        json={"assignments": [{"player_id": player.id, "team_id": team_a.id}]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()[0]["team_id"] == team_a.id

    db_session.refresh(player)
    assert player.team_id == team_a.id


def test_unassigns_player_with_null_team_id(client, db_session):
    tournament, player, team_a, _team_b = _create_team_tournament(db_session)
    player.team_id = team_a.id
    db_session.commit()
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}

    resp = client.patch(
        f"{API}/tournaments/{tournament.id}/players/team-id-assignments",
        json={"assignments": [{"player_id": player.id, "team_id": None}]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    db_session.refresh(player)
    assert player.team_id is None


def test_rejects_team_id_not_belonging_to_tournament(client, db_session):
    tournament, player, _team_a, _team_b = _create_team_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}

    resp = client.patch(
        f"{API}/tournaments/{tournament.id}/players/team-id-assignments",
        json={"assignments": [{"player_id": player.id, "team_id": "TEAM_doesnotexist"}]},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text
