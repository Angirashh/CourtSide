import asyncio
import logging
from typing import Dict, Set

import psycopg

from app.core.config import settings

logger = logging.getLogger(__name__)

# In-process fan-out registry: one set of queues per tournament_id, one entry per currently
# connected SSE client (routes_public.py's /tournaments/{id}/events). Pure local state -- the
# cross-instance part is handled entirely by Postgres LISTEN/NOTIFY in run_listener() below.
_subscribers: Dict[str, Set["asyncio.Queue[None]"]] = {}


def subscribe(tournament_id: str) -> "asyncio.Queue[None]":
    queue: "asyncio.Queue[None]" = asyncio.Queue()
    _subscribers.setdefault(tournament_id, set()).add(queue)
    return queue


def unsubscribe(tournament_id: str, queue: "asyncio.Queue[None]") -> None:
    subs = _subscribers.get(tournament_id)
    if not subs:
        return
    subs.discard(queue)
    if not subs:
        _subscribers.pop(tournament_id, None)


def _broadcast(tournament_id: str) -> None:
    # The payload carries no data beyond "something changed" -- clients refetch the real REST
    # endpoints for the actual update, so a queue item is just a wake-up signal.
    for queue in _subscribers.get(tournament_id, ()):
        queue.put_nowait(None)


async def run_listener() -> None:
    """
    Long-lived background task (started from main.py's lifespan): holds one direct,
    session-mode Postgres connection and relays every `tournament_updates` NOTIFY (fired by
    notify_tournament_changed, app/services/live_updates.py, from any instance's normal request
    connection) to this instance's locally-subscribed SSE clients.

    No-ops entirely if LISTEN_DATABASE_URL isn't configured (e.g. local SQLite dev) -- spectators
    simply fall back to the slower polling backstop in that case. Reconnects with backoff on any
    connection error instead of leaving live push silently dead for the rest of the process.
    """
    if not settings.LISTEN_DATABASE_URL:
        logger.info("LISTEN_DATABASE_URL not set -- live push disabled, clients fall back to polling.")
        return

    backoff_seconds = 1
    while True:
        try:
            async with await psycopg.AsyncConnection.connect(
                settings.LISTEN_DATABASE_URL, autocommit=True
            ) as aconn:
                await aconn.execute("LISTEN tournament_updates")
                logger.info("Live-update listener connected.")
                backoff_seconds = 1
                async for notify in aconn.notifies():
                    _broadcast(notify.payload)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Live-update listener dropped, reconnecting in %ss", backoff_seconds)
            await asyncio.sleep(backoff_seconds)
            backoff_seconds = min(backoff_seconds * 2, 30)
