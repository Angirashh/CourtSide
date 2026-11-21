import itertools

import pytest

from app.api import routes_public
from app.core.security import create_access_token
from app.db import models

API = "/api/v1"
_phone_seq = itertools.count(1)


@pytest.fixture(autouse=True)
def _clear_public_showcase_cache():
    """`routes_public._cache` is a module-level singleton (a few seconds' TTL cache shared
    across the whole test process, not per-test-DB) -- without clearing it, a test that hits
    GET /public/tournaments shortly after another one could get back the other test's (by now
    torn-down) in-memory DB's cached result instead of its own."""
    routes_public._cache._store.clear()
    yield
    routes_public._cache._store.clear()


def _unique_phone() -> str:
    return f"90003{next(_phone_seq):05d}"


def _organiser_token(db_session):
    organiser = models.User(
        name="Org", email=f"org-{id(db_session)}@example.com", role=models.UserRole.ORGANISER,
        pin_hash="x", is_approved=True,
    )
    db_session.add(organiser)
    db_session.commit()
    return create_access_token({"sub": organiser.id, "role": organiser.role.value})


def _create_round_robin_tournament(db_session):
    tournament = models.Tournament(
        name="Mixer League", format=models.TournamentFormat.ROUND_ROBIN, status=models.TournamentStatus.DRAFT
    )
    db_session.add(tournament)
    db_session.flush()
    db_session.add(models.Court(tournament_id=tournament.id, name="Court 1", hourly_rate=0))
    db_session.commit()
    db_session.refresh(tournament)
    return tournament


def _add_player(client, headers, tournament_id, name):
    resp = client.post(
        f"{API}/tournaments/{tournament_id}/players", json={"name": name, "phone": _unique_phone()}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_public_summary_shows_round_robin_champion_once_decided(client, db_session):
    tournament = _create_round_robin_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}

    names = ["P0", "P1", "P2", "P3"]
    players_by_name = {name: _add_player(client, headers, tournament.id, name) for name in names}
    id_rank = {players_by_name[name]["id"]: idx for idx, name in enumerate(names)}

    # 4 players x 3 matches each = a complete round robin (every pair faces off exactly once).
    gen = client.post(
        f"{API}/tournaments/{tournament.id}/generate-schedule",
        json={"start_time": "2026-01-01T09:00:00", "matches_per_player": 3},
        headers=headers,
    )
    assert gen.status_code == 200, gen.text

    start = client.post(f"{API}/tournaments/{tournament.id}/start", headers=headers)
    assert start.status_code == 200, start.text

    matches = db_session.query(models.Match).filter(models.Match.tournament_id == tournament.id).all()
    assert len(matches) == 6  # C(4, 2)

    # Lower-index player always wins -- P0 sweeps every opponent (3 wins), P1 beats P2/P3 (2
    # wins), P2 beats P3 (1 win), P3 wins nothing. Deterministic, no tiebreak needed.
    for m in matches:
        winner = m.player1_id if id_rank[m.player1_id] < id_rank[m.player2_id] else m.player2_id
        m.winner_id = winner
        m.is_completed = True
        m.status = models.MatchStatus.COMPLETED
    db_session.commit()

    resp = client.get(f"{API}/public/tournaments")
    assert resp.status_code == 200, resp.text
    entry = next(t for t in resp.json() if t["id"] == tournament.id)
    assert entry["champion_name"] == "P0"
    assert entry["runner_up_name"] == "P1"


def test_public_summary_round_robin_champion_none_until_all_matches_decided(client, db_session):
    tournament = _create_round_robin_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}
    for name in ["P0", "P1", "P2", "P3"]:
        _add_player(client, headers, tournament.id, name)

    gen = client.post(
        f"{API}/tournaments/{tournament.id}/generate-schedule",
        json={"start_time": "2026-01-01T09:00:00", "matches_per_player": 3},
        headers=headers,
    )
    assert gen.status_code == 200, gen.text
    start = client.post(f"{API}/tournaments/{tournament.id}/start", headers=headers)
    assert start.status_code == 200, start.text

    matches = db_session.query(models.Match).filter(models.Match.tournament_id == tournament.id).all()
    # Complete all but one match.
    for m in matches[:-1]:
        m.winner_id = m.player1_id
        m.is_completed = True
        m.status = models.MatchStatus.COMPLETED
    db_session.commit()

    resp = client.get(f"{API}/public/tournaments")
    assert resp.status_code == 200, resp.text
    entry = next(t for t in resp.json() if t["id"] == tournament.id)
    assert entry["champion_name"] is None
    assert entry["runner_up_name"] is None
