from datetime import datetime

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


def test_generate_schedule_honours_per_court_available_from(client, db_session):
    """
    3 courts free from the tournament's start, a 4th not free for another 30 minutes — the
    generalized, format-agnostic case from the organiser's "3 courts at 1pm, 1 court at 1:30pm"
    scenario. Enough players that the solver actually needs all 4 courts, so the late one is
    guaranteed to be used rather than just skipped.
    """
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}

    resp = client.post(
        f"{API}/tournaments",
        json={
            "name": "Availability Test", "format": "GROUP_KNOCKOUT", "category": "FRIENDLY",
            "venue": "Test Venue", "tournament_date": "2026-01-01",
            "courts": [
                {"name": "Court A", "hourly_rate": 100},
                {"name": "Court B", "hourly_rate": 100},
                {"name": "Court C", "hourly_rate": 100},
                {"name": "Court D", "hourly_rate": 100},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    tournament = resp.json()
    tid = tournament["id"]
    court_d_id = tournament["courts"][3]["id"]

    patch_resp = client.patch(
        f"{API}/tournaments/{tid}/courts/{court_d_id}", json={"available_from_minutes": 30}, headers=headers
    )
    assert patch_resp.status_code == 200, patch_resp.text
    assert patch_resp.json()["available_from_minutes"] == 30

    for i in range(8):
        r = client.post(f"{API}/tournaments/{tid}/players", json={"name": f"P{i}"}, headers=headers)
        assert r.status_code == 201, r.text

    gen = client.post(
        f"{API}/tournaments/{tid}/generate-schedule",
        json={"start_time": "2026-01-01T13:00:00", "num_groups": 1},
        headers=headers,
    )
    assert gen.status_code == 200, gen.text

    detail = client.get(f"{API}/tournaments/{tid}", headers=headers).json()
    court_d_matches = [m for m in detail["matches"] if m["court_id"] == court_d_id and m["scheduled_start_time"]]
    assert court_d_matches, "expected Court D to actually be used given 8 players"
    for m in court_d_matches:
        assert datetime.fromisoformat(m["scheduled_start_time"]) >= datetime(2026, 1, 1, 13, 30)

    other_courts = {c["id"] for c in tournament["courts"][:3]}
    other_matches = [m for m in detail["matches"] if m["court_id"] in other_courts and m["scheduled_start_time"]]
    assert any(
        datetime.fromisoformat(m["scheduled_start_time"]) == datetime(2026, 1, 1, 13, 0) for m in other_matches
    ), "the other 3 courts shouldn't be held back by Court D's later opening"


def test_court_create_and_default_available_from_is_zero(client, db_session):
    headers = {"Authorization": f"Bearer {_organiser_token(db_session)}"}
    resp = client.post(
        f"{API}/tournaments",
        json={
            "name": "Default Availability", "format": "GROUP_KNOCKOUT", "category": "FRIENDLY",
            "venue": "Test Venue", "tournament_date": "2026-01-01", "courts": [{"name": "Court 1"}],
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["courts"][0]["available_from_minutes"] == 0
