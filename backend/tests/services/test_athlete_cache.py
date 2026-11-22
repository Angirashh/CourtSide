import uuid

from app.core.security import create_access_token
from app.db import models
from app.services import athlete_cache

API = "/api/v1"


def test_get_put_invalidate_roundtrip():
    athlete_cache.put("ATH_1", {"name": "cached"})
    assert athlete_cache.get("ATH_1") == {"name": "cached"}

    athlete_cache.invalidate("ATH_1")
    assert athlete_cache.get("ATH_1") is None


def test_invalidate_on_missing_key_is_a_noop():
    athlete_cache.invalidate("ATH_never_cached")  # must not raise


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


def test_ending_tournament_busts_cached_profile_immediately(client, db_session):
    """A GET right before end_tournament must not leave a stale cached response that then
    shadows the just-finalized career totals on the very next GET."""
    org = _organiser(db_session)
    headers = {"Authorization": f"Bearer {_token(org)}"}
    tournament = models.Tournament(
        name="Cache Open", format=models.TournamentFormat.ROUND_ROBIN,
        status=models.TournamentStatus.IN_PROGRESS, organiser_id=org.id,
    )
    db_session.add(tournament)
    db_session.flush()

    athlete = models.Athlete(name="Cached Athlete")
    db_session.add(athlete)
    db_session.flush()
    p1 = models.Player(id=f"P_{uuid.uuid4().hex[:8]}", tournament_id=tournament.id, athlete_id=athlete.id, name="Me")
    p2 = models.Player(id=f"P_{uuid.uuid4().hex[:8]}", tournament_id=tournament.id, name="Opp")
    db_session.add_all([p1, p2])
    db_session.flush()
    match = models.Match(
        id=f"M_{uuid.uuid4().hex[:8]}", tournament_id=tournament.id, stage=models.MatchStage.ROUND_ROBIN,
        round_num=1, player1_id=p1.id, player2_id=p2.id, winner_id=p1.id, is_completed=True,
    )
    db_session.add(match)
    db_session.commit()

    # Pre-warm the cache with the pre-finalization (zero career stats) response.
    pre = client.get(f"{API}/athletes/{athlete.id}")
    assert pre.status_code == 200, pre.text
    assert pre.json()["matches_played"] == 0

    end = client.post(f"{API}/tournaments/{tournament.id}/end", headers=headers)
    assert end.status_code == 200, end.text

    post = client.get(f"{API}/athletes/{athlete.id}")
    assert post.status_code == 200, post.text
    assert post.json()["matches_played"] == 1
    assert post.json()["matches_won"] == 1
