import itertools

import pytest

from app.core.security import create_access_token
from app.db import models

API = "/api/v1"
_phone_seq = itertools.count(1)


def _unique_phone() -> str:
    return f"90002{next(_phone_seq):05d}"


def _organiser_token(db_session, name="Org"):
    organiser = models.User(
        name=name, email=f"{name}-{id(db_session)}-{next(_phone_seq)}@example.com",
        role=models.UserRole.ORGANISER, pin_hash="x", is_approved=True,
    )
    db_session.add(organiser)
    db_session.commit()
    return organiser, create_access_token({"sub": organiser.id, "role": organiser.role.value})


def _create_tournament(db_session, organiser_id=None, name="Tournament"):
    tournament = models.Tournament(
        name=name, format=models.TournamentFormat.ROUND_ROBIN, status=models.TournamentStatus.DRAFT,
        organiser_id=organiser_id,
    )
    db_session.add(tournament)
    db_session.commit()
    db_session.refresh(tournament)
    return tournament


def _add_player(client, headers, tournament_id, name, team_id=None):
    payload = {"name": name, "phone": _unique_phone()}
    if team_id:
        payload["team_id"] = team_id
    resp = client.post(f"{API}/tournaments/{tournament_id}/players", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_import_candidates_rejects_source_from_another_organiser(client, db_session):
    org_a, token_a = _organiser_token(db_session, "OrgA")
    org_b, token_b = _organiser_token(db_session, "OrgB")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    target = _create_tournament(db_session, organiser_id=org_a.id, name="Target")
    source = _create_tournament(db_session, organiser_id=org_b.id, name="Source")
    _add_player(client, headers_b, source.id, "P1")

    resp = client.get(
        f"{API}/tournaments/{target.id}/players/import-candidates",
        params={"source_tournament_id": source.id},
        headers=headers_a,
    )
    assert resp.status_code == 403


def test_import_candidates_returns_past_roster_excluding_already_added(client, db_session):
    org, token = _organiser_token(db_session)
    headers = {"Authorization": f"Bearer {token}"}

    source = _create_tournament(db_session, organiser_id=org.id, name="Source")
    target = _create_tournament(db_session, organiser_id=org.id, name="Target")

    p1 = _add_player(client, headers, source.id, "Alice")
    p2 = _add_player(client, headers, source.id, "Bob")

    # Alice already on the target roster (linked to the same athlete) -- should be excluded.
    alice_athlete_id = p1["athlete_id"]
    resp = client.post(
        f"{API}/tournaments/{target.id}/players", json={"name": "Alice", "athlete_id": alice_athlete_id},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text

    resp = client.get(
        f"{API}/tournaments/{target.id}/players/import-candidates",
        params={"source_tournament_id": source.id},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    names = [r["name"] for r in resp.json()]
    assert names == ["Bob"]
    assert p2["athlete_id"] in [r["id"] for r in resp.json()]


def test_import_candidates_rejects_same_tournament_as_source(client, db_session):
    org, token = _organiser_token(db_session)
    headers = {"Authorization": f"Bearer {token}"}
    tournament = _create_tournament(db_session, organiser_id=org.id)

    resp = client.get(
        f"{API}/tournaments/{tournament.id}/players/import-candidates",
        params={"source_tournament_id": tournament.id},
        headers=headers,
    )
    assert resp.status_code == 400


def test_import_adds_players_linked_to_existing_athletes(client, db_session):
    org, token = _organiser_token(db_session)
    headers = {"Authorization": f"Bearer {token}"}

    source = _create_tournament(db_session, organiser_id=org.id, name="Source")
    target = _create_tournament(db_session, organiser_id=org.id, name="Target")

    p1 = _add_player(client, headers, source.id, "Alice")
    p2 = _add_player(client, headers, source.id, "Bob")

    athlete_count_before = db_session.query(models.Athlete).count()

    resp = client.post(
        f"{API}/tournaments/{target.id}/players/import",
        json={"athlete_ids": [p1["athlete_id"], p2["athlete_id"]]},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert len(body["added"]) == 2
    assert body["skipped_count"] == 0
    assert {p["athlete_id"] for p in body["added"]} == {p1["athlete_id"], p2["athlete_id"]}

    # No new Athlete rows were created -- the import links to the existing ones.
    assert db_session.query(models.Athlete).count() == athlete_count_before


def test_import_skips_athlete_already_on_target_roster(client, db_session):
    org, token = _organiser_token(db_session)
    headers = {"Authorization": f"Bearer {token}"}

    source = _create_tournament(db_session, organiser_id=org.id, name="Source")
    target = _create_tournament(db_session, organiser_id=org.id, name="Target")

    p1 = _add_player(client, headers, source.id, "Alice")
    client.post(
        f"{API}/tournaments/{target.id}/players", json={"name": "Alice", "athlete_id": p1["athlete_id"]},
        headers=headers,
    )

    resp = client.post(
        f"{API}/tournaments/{target.id}/players/import",
        json={"athlete_ids": [p1["athlete_id"]]},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["added"] == []
    assert body["skipped_count"] == 1


def test_import_rejects_team_id_for_non_team_tournament(client, db_session):
    org, token = _organiser_token(db_session)
    headers = {"Authorization": f"Bearer {token}"}

    source = _create_tournament(db_session, organiser_id=org.id, name="Source")
    target = _create_tournament(db_session, organiser_id=org.id, name="Target")
    p1 = _add_player(client, headers, source.id, "Alice")

    resp = client.post(
        f"{API}/tournaments/{target.id}/players/import",
        json={"athlete_ids": [p1["athlete_id"]], "team_id": "T_fake"},
        headers=headers,
    )
    assert resp.status_code == 400
