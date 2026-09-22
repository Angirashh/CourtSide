import re
from datetime import datetime
from typing import List

from app.db import models
from app.schemas.public import PublicCourtMatch, PublicCourtQueue


def _natural_key(name: str):
    # "Court 2" before "Court 10"
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", name)]


def build_court_queues(tournament: models.Tournament) -> List[PublicCourtQueue]:
    """
    Per court: just one match — the one currently on court, or if none, the next
    scheduled one. Courts with nothing live or upcoming are left out entirely.
    """
    players_by_id = {p.id: p for p in tournament.players}

    def side(player_id):
        player = players_by_id.get(player_id)
        return (player.name, bool(player.is_placeholder)) if player else ("TBD", False)

    open_matches = [
        m
        for m in tournament.matches
        if m.court_id
        and not m.is_completed
        and not m.is_bye
        and not m.is_walkover
        and m.status in (models.MatchStatus.IN_PROGRESS, models.MatchStatus.SCHEDULED)
    ]

    queues = []
    for court in sorted(tournament.courts, key=lambda c: _natural_key(c.name)):
        on_court = [m for m in open_matches if m.court_id == court.id]
        if not on_court:
            continue
        # Live match first, then by start time (unscheduled last) — so the first
        # entry is the one currently on court, or else the next one up.
        on_court.sort(key=lambda m: (m.status != models.MatchStatus.IN_PROGRESS, m.scheduled_start_time or datetime.max))
        shown = on_court[:1]

        matches = []
        for m in shown:
            p1_name, p1_placeholder = side(m.player1_id)
            p2_name, p2_placeholder = side(m.player2_id)
            matches.append(
                PublicCourtMatch(
                    id=m.id,
                    stage=m.stage.value,
                    round_num=m.round_num,
                    status=m.status,
                    scheduled_start_time=m.scheduled_start_time,
                    player1_name=p1_name,
                    player2_name=p2_name,
                    player1_is_placeholder=p1_placeholder,
                    player2_is_placeholder=p2_placeholder,
                )
            )
        queues.append(
            PublicCourtQueue(
                court_id=court.id, court_name=court.name, matches=matches, more_upcoming=len(on_court) - len(shown)
            )
        )
    return queues
