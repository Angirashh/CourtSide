from collections import defaultdict

import pytest

from app.core.config import settings
from app.core.security import create_access_token
from app.db import models

API = "/api/v1"


def _google_claims(email="player@example.com", sub="google-sub-1", name="Test Player", email_verified=True):
    return {"email": email, "email_verified": email_verified, "sub": sub, "name": name}


@pytest.fixture
def mock_google(monkeypatch):
    # Must not depend on a real backend/.env (absent in CI/a fresh checkout) — the endpoint
    # refuses to even try verification when GOOGLE_CLIENT_ID is unset.
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


def _google_login(client):
    return client.post(f"{API}/auth/player/google", json={"id_token": "fake-token"})


def _organiser_token(db_session):
    organiser = models.User(
        name="Org", email=f"org-{id(db_session)}@example.com", role=models.UserRole.ORGANISER,
        pin_hash="x", is_approved=True,
    )
    db_session.add(organiser)
    db_session.commit()
    return create_access_token({"sub": organiser.id, "role": organiser.role.value})


def _create_team_friendly_tournament(db_session):
    tournament = models.Tournament(
        name="Friendly Mixer", format=models.TournamentFormat.TEAM_FRIENDLY, status=models.TournamentStatus.DRAFT
    )
    db_session.add(tournament)
    db_session.flush()
    db_session.add(models.Court(tournament_id=tournament.id, name="Court 1", hourly_rate=0))
    db_session.commit()
    db_session.refresh(tournament)
    return tournament


def _add_player(client, headers, tournament_id, name, team=None):
    resp = client.post(f"{API}/tournaments/{tournament_id}/players", json={"name": name}, headers=headers)
    assert resp.status_code == 201, resp.text
    player = resp.json()

    if team is not None:
        patch_resp = client.patch(
            f"{API}/tournaments/{tournament_id}/players/{player['id']}", json={"team": team}, headers=headers
        )
        assert patch_resp.status_code == 200, patch_resp.text
        player = patch_resp.json()
    return player


def _generate(client, tournament_id, headers, matches_per_player=None):
    payload = {"start_time": "2026-01-01T09:00:00"}
    if matches_per_player is not None:
        payload["matches_per_player"] = matches_per_player
    return client.post(f"{API}/tournaments/{tournament_id}/generate-schedule", json=payload, headers=headers)


def test_update_player_rejects_invalid_team_value(client, db_session):
    tournament = _create_team_friendly_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}
    player = _add_player(client, headers, tournament.id, "P1")

    resp = client.patch(f"{API}/tournaments/{tournament.id}/players/{player['id']}", json={"team": "C"}, headers=headers)
    assert resp.status_code == 400


def test_generate_schedule_requires_matches_per_player(client, db_session):
    tournament = _create_team_friendly_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}
    _add_player(client, headers, tournament.id, "A1", team="A")
    _add_player(client, headers, tournament.id, "B1", team="B")

    resp = _generate(client, tournament.id, headers)  # no matches_per_player
    assert resp.status_code == 400
    assert "matches" in resp.json()["detail"].lower()


def test_generate_schedule_requires_team_assignment(client, db_session):
    tournament = _create_team_friendly_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}
    _add_player(client, headers, tournament.id, "P1")
    _add_player(client, headers, tournament.id, "P2")

    resp = _generate(client, tournament.id, headers, matches_per_player=2)
    assert resp.status_code == 400
    assert "team" in resp.json()["detail"].lower()


def test_generate_schedule_rejects_too_few_players_per_team(client, db_session):
    tournament = _create_team_friendly_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}
    _add_player(client, headers, tournament.id, "A1", team="A")
    _add_player(client, headers, tournament.id, "B1", team="B")

    resp = _generate(client, tournament.id, headers, matches_per_player=1)
    assert resp.status_code == 400
    assert "at least 2 players" in resp.json()["detail"].lower()


def test_generate_schedule_rejects_unequal_team_sizes(client, db_session):
    tournament = _create_team_friendly_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}
    for name in ["A1", "A2", "A3"]:
        _add_player(client, headers, tournament.id, name, team="A")
    for name in ["B1", "B2"]:
        _add_player(client, headers, tournament.id, name, team="B")

    resp = _generate(client, tournament.id, headers, matches_per_player=2)
    assert resp.status_code == 400
    assert "same size" in resp.json()["detail"].lower()


def test_generate_schedule_rejects_quota_exceeding_team_size(client, db_session):
    tournament = _create_team_friendly_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}
    for name in ["A1", "A2"]:
        _add_player(client, headers, tournament.id, name, team="A")
    for name in ["B1", "B2"]:
        _add_player(client, headers, tournament.id, name, team="B")

    resp = _generate(client, tournament.id, headers, matches_per_player=3)  # only 2 players per team
    assert resp.status_code == 400
    assert "isn't possible" in resp.json()["detail"].lower()


def test_generate_schedule_produces_valid_crossover_matches(client, db_session):
    tournament = _create_team_friendly_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}

    for name in ["A1", "A2", "A3", "A4"]:
        _add_player(client, headers, tournament.id, name, team="A")
    for name in ["B1", "B2", "B3", "B4"]:
        _add_player(client, headers, tournament.id, name, team="B")

    resp = _generate(client, tournament.id, headers, matches_per_player=3)
    assert resp.status_code == 200, resp.text

    matches = db_session.query(models.Match).filter(models.Match.tournament_id == tournament.id).all()
    assert len(matches) == 12  # 4 players/side * 3 matches each = 12 cross-team edges

    players = db_session.query(models.Player).filter(models.Player.tournament_id == tournament.id).all()
    team_by_id = {p.id: p.team for p in players}

    for m in matches:
        assert m.stage == models.MatchStage.CROSSOVER
        assert team_by_id[m.player1_id] != team_by_id[m.player2_id]

    opponents = defaultdict(set)
    for m in matches:
        opponents[m.player1_id].add(m.player2_id)
        opponents[m.player2_id].add(m.player1_id)
    for p in players:
        assert len(opponents[p.id]) == 3


def test_regenerating_schedule_can_produce_a_different_draw(client, db_session):
    tournament = _create_team_friendly_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}

    for name in ["A1", "A2", "A3", "A4", "A5"]:
        _add_player(client, headers, tournament.id, name, team="A")
    for name in ["B1", "B2", "B3", "B4", "B5"]:
        _add_player(client, headers, tournament.id, name, team="B")

    seen_pairings = set()
    for _ in range(6):
        resp = _generate(client, tournament.id, headers, matches_per_player=3)
        assert resp.status_code == 200, resp.text
        matches = db_session.query(models.Match).filter(models.Match.tournament_id == tournament.id).all()
        assert len(matches) == 15
        seen_pairings.add(frozenset((m.player1_id, m.player2_id) for m in matches))

    assert len(seen_pairings) > 1


def test_full_team_friendly_lifecycle_updates_career_stats(client, db_session, mock_google):
    tournament = _create_team_friendly_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}

    def _register_player(email, sub, name):
        mock_google(_google_claims(email=email, sub=sub, name=name))
        token = _google_login(client).json()["access_token"]
        reg = client.post(
            f"{API}/tournaments/{tournament.id}/players/self-register",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert reg.status_code == 201, reg.text
        return reg.json()

    a1 = _register_player("a1@example.com", "sub-a1", "A1")
    a2 = _register_player("a2@example.com", "sub-a2", "A2")
    b1 = _register_player("b1@example.com", "sub-b1", "B1")
    b2 = _register_player("b2@example.com", "sub-b2", "B2")

    for p, team in [(a1, "A"), (a2, "A"), (b1, "B"), (b2, "B")]:
        resp = client.patch(
            f"{API}/tournaments/{tournament.id}/players/{p['id']}",
            json={"team": team},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

    gen = _generate(client, tournament.id, headers, matches_per_player=2)
    assert gen.status_code == 200, gen.text

    start = client.post(f"{API}/tournaments/{tournament.id}/start", headers=headers)
    assert start.status_code == 200, start.text

    matches = db_session.query(models.Match).filter(models.Match.tournament_id == tournament.id).all()
    assert len(matches) == 4  # complete bipartite K(2,2): each of 2v2 plays both opponents

    for m in matches:
        m.is_completed = True
        m.status = models.MatchStatus.COMPLETED
        m.winner_id = m.player1_id  # Team A always wins, for a deterministic assertion below
    db_session.commit()

    end = client.post(f"{API}/tournaments/{tournament.id}/end", headers=headers)
    assert end.status_code == 200, end.text

    a1_user = db_session.query(models.User).filter(models.User.email == "a1@example.com").first()
    a1_athlete = db_session.query(models.Athlete).filter(models.Athlete.id == a1_user.athlete_id).first()
    assert a1_athlete.tournaments_played == 1
    assert a1_athlete.matches_played == 2
    assert a1_athlete.matches_won == 2
    assert a1_athlete.matches_lost == 0

    b1_user = db_session.query(models.User).filter(models.User.email == "b1@example.com").first()
    b1_athlete = db_session.query(models.Athlete).filter(models.Athlete.id == b1_user.athlete_id).first()
    assert b1_athlete.matches_played == 2
    assert b1_athlete.matches_won == 0
    assert b1_athlete.matches_lost == 2
