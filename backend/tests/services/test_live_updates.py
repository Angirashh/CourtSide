from app.db import models
from app.services.live_updates import notify_tournament_changed


def test_notify_tournament_changed_is_a_noop_on_sqlite(db_session):
    """The test suite runs on SQLite, where LISTEN/NOTIFY doesn't exist -- this call must never
    raise there, since every mutating endpoint in the app now calls it unconditionally."""
    tournament = models.Tournament(name="T", format=models.TournamentFormat.ROUND_ROBIN)
    db_session.add(tournament)
    db_session.commit()

    notify_tournament_changed(db_session, tournament.id)  # must not raise
