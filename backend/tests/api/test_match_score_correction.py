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


def _tournament(db_session, organiser_id=None):
    tournament = models.Tournament(
        name="Test Open", format=models.TournamentFormat.KNOCKOUT, status=models.TournamentStatus.IN_PROGRESS,
        organiser_id=organiser_id,
    )
    db_session.add(tournament)
    db_session.commit()
    db_session.refresh(tournament)
    return tournament


def _player(db_session, tournament_id, name):
    player = models.Player(id=f"P_{uuid.uuid4().hex[:8]}", tournament_id=tournament_id, name=name)
    db_session.add(player)
    db_session.flush()
    return player


def _completed_match(db_session, tournament_id, p1, p2, winner, scores, **kwargs):
    match = models.Match(
        id=f"M_{uuid.uuid4().hex[:8]}", tournament_id=tournament_id, stage=models.MatchStage.KNOCKOUT, round_num=1,
        player1_id=p1.id, player2_id=p2.id, winner_id=winner.id, is_completed=True, scores=scores, **kwargs,
    )
    db_session.add(match)
    db_session.commit()
    db_session.refresh(match)
    return match


def test_correct_score_with_same_winner_succeeds(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, organiser_id=org.id)
    p1 = _player(db_session, tournament.id, "P1")
    p2 = _player(db_session, tournament.id, "P2")
    match = _completed_match(db_session, tournament.id, p1, p2, winner=p1, scores=[{"p1": 21, "p2": 15}, {"p1": 21, "p2": 19}])

    resp = client.patch(
        f"{API}/matches/{match.id}/score",
        json={"winner_id": p1.id, "scores": [{"p1": 21, "p2": 15}, {"p1": 21, "p2": 17}]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["scores"] == [{"p1": 21, "p2": 15}, {"p1": 21, "p2": 17}]
    assert body["winner_id"] == p1.id


def test_correct_score_rejects_changed_winner(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, organiser_id=org.id)
    p1 = _player(db_session, tournament.id, "P1")
    p2 = _player(db_session, tournament.id, "P2")
    match = _completed_match(db_session, tournament.id, p1, p2, winner=p1, scores=[{"p1": 21, "p2": 15}, {"p1": 21, "p2": 19}])

    resp = client.patch(
        f"{API}/matches/{match.id}/score",
        json={"winner_id": p2.id, "scores": [{"p1": 15, "p2": 21}, {"p1": 19, "p2": 21}]},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text
    assert "winner" in resp.json()["detail"].lower()


def test_correct_score_rejects_scores_that_dont_favor_winner(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, organiser_id=org.id)
    p1 = _player(db_session, tournament.id, "P1")
    p2 = _player(db_session, tournament.id, "P2")
    match = _completed_match(db_session, tournament.id, p1, p2, winner=p1, scores=[{"p1": 21, "p2": 15}, {"p1": 21, "p2": 19}])

    resp = client.patch(
        f"{API}/matches/{match.id}/score",
        json={"winner_id": p1.id, "scores": [{"p1": 15, "p2": 21}, {"p1": 19, "p2": 21}]},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_correct_score_rejects_not_yet_completed_match(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, organiser_id=org.id)
    p1 = _player(db_session, tournament.id, "P1")
    p2 = _player(db_session, tournament.id, "P2")
    match = models.Match(
        id=f"M_{uuid.uuid4().hex[:8]}", tournament_id=tournament.id, stage=models.MatchStage.KNOCKOUT, round_num=1,
        player1_id=p1.id, player2_id=p2.id,
    )
    db_session.add(match)
    db_session.commit()

    resp = client.patch(
        f"{API}/matches/{match.id}/score",
        json={"winner_id": p1.id, "scores": [{"p1": 21, "p2": 15}]},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_correct_score_rejects_walkover(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, organiser_id=org.id)
    p1 = _player(db_session, tournament.id, "P1")
    p2 = _player(db_session, tournament.id, "P2")
    match = _completed_match(db_session, tournament.id, p1, p2, winner=p1, scores=None, is_walkover=True)

    resp = client.patch(
        f"{API}/matches/{match.id}/score",
        json={"winner_id": p1.id, "scores": [{"p1": 21, "p2": 15}]},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


def test_correct_score_rejects_no_result_match(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, organiser_id=org.id)
    p1 = _player(db_session, tournament.id, "P1")
    p2 = _player(db_session, tournament.id, "P2")
    match = models.Match(
        id=f"M_{uuid.uuid4().hex[:8]}", tournament_id=tournament.id, stage=models.MatchStage.ROUND_ROBIN, round_num=1,
        player1_id=p1.id, player2_id=p2.id, is_completed=True, is_no_result=True,
    )
    db_session.add(match)
    db_session.commit()

    resp = client.patch(
        f"{API}/matches/{match.id}/score",
        json={"winner_id": p1.id, "scores": [{"p1": 21, "p2": 15}]},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text
