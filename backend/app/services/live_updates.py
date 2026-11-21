from sqlalchemy import text
from sqlalchemy.orm import Session


def notify_tournament_changed(db: Session, tournament_id: str) -> None:
    """
    Pings every backend instance's live-update listener (app/services/live_listener.py) so
    spectators connected to the public tournament page refresh immediately instead of waiting
    for their next poll. Postgres fans the notification out to every session LISTENing on the
    channel, so this works correctly even if the write and the listening instance differ.

    Call this once per mutating request, immediately BEFORE its db.commit() -- piggybacking on
    the same transaction means a rollback correctly cancels the notify too, and it avoids a
    second round trip after commit.

    No-ops on SQLite (local dev/tests), since LISTEN/NOTIFY is Postgres-only.
    """
    if db.bind.dialect.name != "postgresql":
        return
    db.execute(text("SELECT pg_notify('tournament_updates', :tid)"), {"tid": tournament_id})
