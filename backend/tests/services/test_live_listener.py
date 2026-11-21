import asyncio

from app.services import live_listener


def test_subscribe_receives_broadcast_for_its_tournament():
    queue = live_listener.subscribe("T1")
    try:
        live_listener._broadcast("T1")
        assert queue.get_nowait() is None
    finally:
        live_listener.unsubscribe("T1", queue)


def test_broadcast_does_not_reach_a_different_tournaments_subscriber():
    queue_a = live_listener.subscribe("TA")
    queue_b = live_listener.subscribe("TB")
    try:
        live_listener._broadcast("TA")
        assert queue_a.get_nowait() is None
        assert queue_b.empty()
    finally:
        live_listener.unsubscribe("TA", queue_a)
        live_listener.unsubscribe("TB", queue_b)


def test_unsubscribe_removes_the_empty_entry_entirely():
    queue = live_listener.subscribe("T2")
    live_listener.unsubscribe("T2", queue)
    assert "T2" not in live_listener._subscribers


def test_broadcast_for_unknown_tournament_is_a_noop():
    live_listener._broadcast("no-such-tournament")  # must not raise


def test_run_listener_returns_immediately_when_unconfigured(monkeypatch):
    """Mirrors local/test SQLite setups, where LISTEN_DATABASE_URL is blank."""
    monkeypatch.setattr(live_listener.settings, "LISTEN_DATABASE_URL", "")
    asyncio.run(live_listener.run_listener())  # must return, not hang or raise
