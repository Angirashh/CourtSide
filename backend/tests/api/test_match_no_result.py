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


def _tournament(db_session, status=models.TournamentStatus.IN_PROGRESS, organiser_id=None):
    tournament = models.Tournament(
        name="Mixer League", format=models.TournamentFormat.ROUND_ROBIN, status=status, organiser_id=organiser_id,
    )
    db_session.add(tournament)
    db_session.commit()
    db_session.refresh(tournament)
    return tournament


def _athlete_player(db_session, tournament_id, name):
    athlete = models.Athlete(name=name)
    db_session.add(athlete)
    db_session.flush()
    player = models.Player(
        id=f"P_{uuid.uuid4().hex[:8]}", tournament_id=tournament_id, athlete_id=athlete.id, name=name,
    )
    db_session.add(player)
    db_session.flush()
    return athlete, player


def _match(db_session, tournament_id, stage, player1, player2):
    match = models.Match(
        id=f"M_{uuid.uuid4().hex[:8]}", tournament_id=tournament_id, stage=stage, round_num=1,
        player1_id=player1.id, player2_id=player2.id,
    )
    db_session.add(match)
    db_session.commit()
    db_session.refresh(match)
    return match


def test_mark_no_result_on_round_robin_match(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, organiser_id=org.id)
    _, p1 = _athlete_player(db_session, tournament.id, "P1")
    _, p2 = _athlete_player(db_session, tournament.id, "P2")
    match = _match(db_session, tournament.id, models.MatchStage.ROUND_ROBIN, p1, p2)

    resp = client.post(f"{API}/matches/{match.id}/no-result", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_completed"] is True
    assert body["is_no_result"] is True
    assert body["winner_id"] is None


def test_mark_no_result_rejected_for_knockout_match(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, organiser_id=org.id)
    _, p1 = _athlete_player(db_session, tournament.id, "P1")
    _, p2 = _athlete_player(db_session, tournament.id, "P2")
    match = _match(db_session, tournament.id, models.MatchStage.KNOCKOUT, p1, p2)

    resp = client.post(f"{API}/matches/{match.id}/no-result", headers=headers)
    assert resp.status_code == 400, resp.text


def test_mark_no_result_rejected_once_already_completed(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, organiser_id=org.id)
    _, p1 = _athlete_player(db_session, tournament.id, "P1")
    _, p2 = _athlete_player(db_session, tournament.id, "P2")
    match = _match(db_session, tournament.id, models.MatchStage.ROUND_ROBIN, p1, p2)
    match.is_completed = True
    match.winner_id = p1.id
    db_session.commit()

    resp = client.post(f"{API}/matches/{match.id}/no-result", headers=headers)
    assert resp.status_code == 400, resp.text


def test_no_result_match_unblocks_end_tournament_and_excluded_from_career_stats(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = _tournament(db_session, organiser_id=org.id)
    a1, p1 = _athlete_player(db_session, tournament.id, "P1")
    a2, p2 = _athlete_player(db_session, tournament.id, "P2")
    match = _match(db_session, tournament.id, models.MatchStage.ROUND_ROBIN, p1, p2)

    no_result = client.post(f"{API}/matches/{match.id}/no-result", headers=headers)
    assert no_result.status_code == 200, no_result.text

    end = client.post(f"{API}/tournaments/{tournament.id}/end", headers=headers)
    assert end.status_code == 200, end.text

    db_session.refresh(a1)
    db_session.refresh(a2)
    assert a1.matches_played == 0
    assert a2.matches_played == 0
