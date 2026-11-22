"""
In-process cache for athlete career-profile responses (GET /athletes/me, GET /athletes/{id}).

Unlike the public-showcase endpoints' blind TTL cache (routes_public.py's _TTLCache), this uses
exact invalidation instead of a timer: an athlete's cached profile is only ever thrown away when
something that could actually change it happens -- a tournament they played in gets closed
(finalize_athlete_career_stats, match_progression.py) or their own bio fields get edited
(routes_athletes.py's two PATCH routes). Every other read is served from cache indefinitely, with
no staleness window at all, since nothing else can change these fields.

Per-instance only, like the public cache -- a multi-instance deploy would need to invalidate
every instance (e.g. piggyback on the existing Postgres NOTIFY channel) rather than just this
process's dict.
"""
from typing import Dict, Optional

_cache: Dict[str, object] = {}


def get(athlete_id: str) -> Optional[object]:
    return _cache.get(athlete_id)


def put(athlete_id: str, value: object) -> None:
    _cache[athlete_id] = value


def invalidate(athlete_id: str) -> None:
    _cache.pop(athlete_id, None)
