import re
from datetime import datetime
from typing import List

from app.db import models
from app.schemas.public import PublicCourtMatch, PublicCourtQueue
from app.services.round_labels import build_round_label_fn


def _natural_key(name: str):
    # "Court 2" before "Court 10"
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", name)]


def build_court_queues(tournament: models.Tournament) -> List[PublicCourtQueue]:
    """
    Per court: just one match — the one currently on court, or if none, the next
    scheduled one. Courts with nothing live or upcoming are left out entirely.
    """
    players_by_id = {p.id: p for p in tournament.players}
    round_label = build_round_label_fn(tournament.matches)

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
    open_team_games = [
        game for tie in tournament.team_ties for game in tie.games
        if game.court_id and not game.is_completed and not game.is_skipped
        and game.status in (models.MatchStatus.IN_PROGRESS, models.MatchStatus.SCHEDULED)
    ]

    queues = []
    for court in sorted(tournament.courts, key=lambda c: _natural_key(c.name)):
        on_court = [m for m in open_matches if m.court_id == court.id]
        on_team_court = [game for game in open_team_games if game.court_id == court.id]
        if not on_court and not on_team_court:
            continue
        # Live match first, then by start time (unscheduled last) — so the first
        # entry is the one currently on court, or else the next one up.
        on_court.sort(key=lambda m: (m.status != models.MatchStatus.IN_PROGRESS, m.scheduled_start_time or datetime.max))
        on_team_court.sort(key=lambda game: (game.status != models.MatchStatus.IN_PROGRESS, game.scheduled_start_time or datetime.max))
        candidates = [(m.status != models.MatchStatus.IN_PROGRESS, m.scheduled_start_time or datetime.max, "match", m) for m in on_court]
        candidates.extend((g.status != models.MatchStatus.IN_PROGRESS, g.scheduled_start_time or datetime.max, "team", g) for g in on_team_court)
        candidates.sort(key=lambda item: (item[0], item[1]))
        shown = candidates[:1]

        matches = []
        for _, _, kind, item in shown:
            if kind == "match":
                m = item
                p1_name, p1_placeholder = side(m.player1_id)
                p2_name, p2_placeholder = side(m.player2_id)
                matches.append(PublicCourtMatch(
                    id=m.id, stage=m.stage.value, round_num=m.round_num,
                    round_label=round_label(m.stage, m.round_num, m.group_id), status=m.status,
                    scheduled_start_time=m.scheduled_start_time, player1_name=p1_name, player2_name=p2_name,
                    player1_is_placeholder=p1_placeholder, player2_is_placeholder=p2_placeholder,
                ))
            else:
                game = item
                tie = game.tie
                teams_by_id = {team.id: team for team in tournament.teams}
                team1 = teams_by_id.get(tie.team1_id)
                team2 = teams_by_id.get(tie.team2_id)
                round_name = "Swiss" if tie.stage == models.MatchStage.SWISS else tie.stage.value.title()
                if tie.group_id:
                    round_name = tie.group_id.replace("_", " ")
                matches.append(PublicCourtMatch(
                    id=game.id, stage=tie.stage.value, round_num=tie.round_num,
                    round_label=f"{round_name} · {game.match_type.title()} {game.order_num}",
                    status=game.status, scheduled_start_time=game.scheduled_start_time,
                    player1_name=team1.name if team1 else "TBD",
                    player2_name=team2.name if team2 else "TBD",
                ))
        queues.append(
            PublicCourtQueue(
                court_id=court.id, court_name=court.name, matches=matches,
                more_upcoming=max(len(on_court) + len(on_team_court) - len(shown), 0)
            )
        )
    return queues
