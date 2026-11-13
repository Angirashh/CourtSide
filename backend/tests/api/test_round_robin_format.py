import itertools

import pytest
from pydantic import ValidationError

from app.core.security import create_access_token
from app.db import models
from app.schemas.tournament import TournamentCreate

API = "/api/v1"
_phone_seq = itertools.count(1)


def _unique_phone() -> str:
    return f"90000{next(_phone_seq):05d}"


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
        f"{API}/tournaments/{tournament_id}/players",
        json={"name": name, "phone": _unique_phone()},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _generate(client, tournament_id, headers, matches_per_player=None):
    payload = {"start_time": "2026-01-01T09:00:00"}
    if matches_per_player is not None:
        payload["matches_per_player"] = matches_per_player
    return client.post(f"{API}/tournaments/{tournament_id}/generate-schedule", json=payload, headers=headers)


def test_generate_schedule_requires_matches_per_player(client, db_session):
    tournament = _create_round_robin_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}
    for i in range(9):
        _add_player(client, headers, tournament.id, f"P{i}")

    resp = _generate(client, tournament.id, headers)
    assert resp.status_code == 400, resp.text
    assert "matches each player should play" in resp.json()["detail"]


def test_generate_schedule_rejects_odd_total_quota(client, db_session):
    tournament = _create_round_robin_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}
    for i in range(9):
        _add_player(client, headers, tournament.id, f"P{i}")

    resp = _generate(client, tournament.id, headers, matches_per_player=3)
    assert resp.status_code == 400, resp.text
    assert "even number" in resp.json()["detail"]


def test_generate_schedule_rejects_quota_exceeding_roster_size(client, db_session):
    tournament = _create_round_robin_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}
    for i in range(4):
        _add_player(client, headers, tournament.id, f"P{i}")

    resp = _generate(client, tournament.id, headers, matches_per_player=4)
    assert resp.status_code == 400, resp.text
    assert "isn't possible" in resp.json()["detail"]


def test_generate_schedule_produces_valid_quota_matches(client, db_session):
    tournament = _create_round_robin_tournament(db_session)
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}
    players = [_add_player(client, headers, tournament.id, f"P{i}") for i in range(9)]

    resp = _generate(client, tournament.id, headers, matches_per_player=4)
    assert resp.status_code == 200, resp.text

    get_resp = client.get(f"{API}/tournaments/{tournament.id}", headers=headers)
    assert get_resp.status_code == 200, get_resp.text
    matches = get_resp.json()["matches"]
    real_matches = [m for m in matches if m["stage"] == "ROUND_ROBIN"]
    assert len(real_matches) == (9 * 4) // 2

    match_counts = {p["id"]: 0 for p in players}
    seen_pairs = set()
    for m in real_matches:
        match_counts[m["player1_id"]] += 1
        match_counts[m["player2_id"]] += 1
        pair = frozenset((m["player1_id"], m["player2_id"]))
        assert pair not in seen_pairs
        seen_pairs.add(pair)

    assert all(count == 4 for count in match_counts.values())


def test_round_robin_rejected_for_team_tournaments():
    with pytest.raises(ValidationError, match="Team tournaments require a team competition format"):
        TournamentCreate(
            name="Mixer League",
            tournament_type=models.TournamentType.TEAM,
            format=models.TournamentFormat.ROUND_ROBIN,
            category=models.TournamentCategory.CORPORATE,
            venue="Test Arena",
            tournament_date="2026-01-01",
        )
