from app.core.security import create_access_token
from app.db import models

API = "/api/v1"


def _organiser(db_session, name="Org"):
    organiser = models.User(
        name=name, email=f"{name.lower()}-{id(db_session)}-{name}@example.com", role=models.UserRole.ORGANISER,
        pin_hash="x", is_approved=True,
    )
    db_session.add(organiser)
    db_session.commit()
    db_session.refresh(organiser)
    return organiser


def _token(user):
    return create_access_token({"sub": user.id, "role": user.role.value})


def _tournament(db_session, organiser_id=None, name="Test Open"):
    tournament = models.Tournament(
        name=name, format=models.TournamentFormat.GROUP_KNOCKOUT, status=models.TournamentStatus.DRAFT,
        organiser_id=organiser_id,
    )
    db_session.add(tournament)
    db_session.commit()
    db_session.refresh(tournament)
    return tournament


def _athlete(db_session, name, phone=None, email=None):
    athlete = models.Athlete(name=name, phone=phone, email=email)
    db_session.add(athlete)
    db_session.commit()
    db_session.refresh(athlete)
    return athlete


def _add_player(db_session, tournament_id, athlete):
    import uuid
    player = models.Player(
        id=f"P_{uuid.uuid4().hex[:8]}", tournament_id=tournament_id, athlete_id=athlete.id, name=athlete.name,
    )
    db_session.add(player)
    db_session.commit()
    return player


def test_search_includes_athlete_from_organisers_own_past_tournament(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    past = _tournament(db_session, organiser_id=org.id, name="Past Open")
    target = _tournament(db_session, organiser_id=org.id, name="New Open")
    athlete = _athlete(db_session, "Jane Doe", phone="9123456780")
    _add_player(db_session, past.id, athlete)

    by_name = client.get(f"{API}/tournaments/{target.id}/players/search-existing", params={"q": "jane"}, headers=headers)
    assert by_name.status_code == 200, by_name.text
    assert [r["id"] for r in by_name.json()] == [athlete.id]

    by_phone = client.get(f"{API}/tournaments/{target.id}/players/search-existing", params={"q": "23456"}, headers=headers)
    assert by_phone.status_code == 200, by_phone.text
    assert [r["id"] for r in by_phone.json()] == [athlete.id]


def test_search_excludes_athlete_from_a_different_organisers_tournament(client, db_session):
    org_a = _organiser(db_session, "OrgA")
    org_b = _organiser(db_session, "OrgB")
    headers_b = {"Authorization": f"Bearer {_token(org_b)}"}
    tournament_a = _tournament(db_session, organiser_id=org_a.id, name="Org A's Open")
    tournament_b = _tournament(db_session, organiser_id=org_b.id, name="Org B's Open")
    athlete = _athlete(db_session, "Jane Doe", phone="9123456780")
    _add_player(db_session, tournament_a.id, athlete)

    resp = client.get(f"{API}/tournaments/{tournament_b.id}/players/search-existing", params={"q": "jane"}, headers=headers_b)
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


def test_search_excludes_athlete_already_on_this_tournaments_roster(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    past = _tournament(db_session, organiser_id=org.id, name="Past Open")
    target = _tournament(db_session, organiser_id=org.id, name="New Open")
    athlete = _athlete(db_session, "Jane Doe", phone="9123456780")
    _add_player(db_session, past.id, athlete)
    _add_player(db_session, target.id, athlete)

    resp = client.get(f"{API}/tournaments/{target.id}/players/search-existing", params={"q": "jane"}, headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


def test_register_with_athlete_id_links_existing_athlete(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    past = _tournament(db_session, organiser_id=org.id, name="Past Open")
    target = _tournament(db_session, organiser_id=org.id, name="New Open")
    athlete = _athlete(db_session, "Jane Doe", phone="9123456780")
    _add_player(db_session, past.id, athlete)

    resp = client.post(
        f"{API}/tournaments/{target.id}/players",
        json={"name": athlete.name, "athlete_id": athlete.id},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["athlete_id"] == athlete.id
    assert db_session.query(models.Athlete).filter(models.Athlete.name == "Jane Doe").count() == 1

    dup = client.post(
        f"{API}/tournaments/{target.id}/players",
        json={"name": athlete.name, "athlete_id": athlete.id},
        headers=headers,
    )
    assert dup.status_code == 400, dup.text


def test_register_new_player_requires_phone(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    target = _tournament(db_session, organiser_id=org.id, name="New Open")

    resp = client.post(
        f"{API}/tournaments/{target.id}/players",
        json={"name": "Walk-in Player"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text
    assert "phone" in resp.json()["detail"].lower()


def test_register_new_player_with_matching_phone_links_existing_athlete(client, db_session):
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    past = _tournament(db_session, organiser_id=org.id, name="Past Open")
    target = _tournament(db_session, organiser_id=org.id, name="New Open")
    athlete = _athlete(db_session, "Jane Doe", phone="+919123456780")
    _add_player(db_session, past.id, athlete)

    resp = client.post(
        f"{API}/tournaments/{target.id}/players",
        json={"name": "Jane Doe", "phone": "9123456780"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["athlete_id"] == athlete.id
    assert db_session.query(models.Athlete).filter(models.Athlete.phone == "+919123456780").count() == 1
