"""Team fixture results and standings, built on the existing fixture entrant model."""
from dataclasses import dataclass
from typing import Dict, List, Optional

from app.db import models


@dataclass
class TeamStanding:
    team_id: str
    team_name: str
    seed: int
    matches_played: int = 0
    matches_won: int = 0
    matches_lost: int = 0
    matches_drawn: int = 0
    match_points: float = 0.0
    games_won: int = 0
    games_lost: int = 0
    points_won: int = 0
    points_lost: int = 0
    buchholz: float = 0.0
    sonneborn_berger: float = 0.0
    opponents_played: List[str] = None
    rank: int = 0

    def __post_init__(self):
        if self.opponents_played is None:
            self.opponents_played = []

    @property
    def game_difference(self) -> int:
        return self.games_won - self.games_lost

    @property
    def point_difference(self) -> int:
        return self.points_won - self.points_lost


def team_tie_totals(tie: models.TeamTie) -> Dict[str, Dict[str, int]]:
    totals = {
        tie.team1_id: {"wins": 0, "games_won": 0, "games_lost": 0, "points_won": 0, "points_lost": 0},
        tie.team2_id: {"wins": 0, "games_won": 0, "games_lost": 0, "points_won": 0, "points_lost": 0},
    }
    for game in tie.games:
        if game.is_skipped:
            continue
        if game.winner_team_id in totals:
            totals[game.winner_team_id]["wins"] += 1
        if not game.scores:
            continue
        for score in game.scores:
            p1, p2 = score.get("p1", 0), score.get("p2", 0)
            totals[tie.team1_id]["points_won"] += p1
            totals[tie.team1_id]["points_lost"] += p2
            totals[tie.team2_id]["points_won"] += p2
            totals[tie.team2_id]["points_lost"] += p1
            if p1 > p2:
                totals[tie.team1_id]["games_won"] += 1
                totals[tie.team2_id]["games_lost"] += 1
            elif p2 > p1:
                totals[tie.team2_id]["games_won"] += 1
                totals[tie.team1_id]["games_lost"] += 1
    return totals


def complete_team_tie(tie: models.TeamTie, completion_mode: str) -> bool:
    """Resolve a tie once clinched or all scheduled games have finished."""
    if tie.is_completed:
        return True
    totals = team_tie_totals(tie)
    team1_wins = totals[tie.team1_id]["wins"]
    team2_wins = totals[tie.team2_id]["wins"]
    completed = sum(1 for game in tie.games if game.is_completed and not game.is_skipped)
    remaining = sum(1 for game in tie.games if not game.is_completed and not game.is_skipped)
    count = len(tie.games)

    clinched = team1_wins > count // 2 or team2_wins > count // 2
    if completion_mode == "MAJORITY" and clinched:
        for game in tie.games:
            if not game.is_completed:
                game.is_completed = True
                game.is_skipped = True
                game.status = models.MatchStatus.COMPLETED
        remaining = 0
    elif remaining:
        return False

    team1_diff = totals[tie.team1_id]["points_won"] - totals[tie.team1_id]["points_lost"]
    team2_diff = totals[tie.team2_id]["points_won"] - totals[tie.team2_id]["points_lost"]
    tie.is_draw = team1_wins == team2_wins and team1_diff == team2_diff
    if team1_wins != team2_wins:
        tie.winner_team_id = tie.team1_id if team1_wins > team2_wins else tie.team2_id
    elif team1_diff != team2_diff:
        tie.winner_team_id = tie.team1_id if team1_diff > team2_diff else tie.team2_id
    elif tie.stage == models.MatchStage.KNOCKOUT:
        # Seeds are unique within a tournament and assigned by the organiser.
        seeds = {team.id: team.seed or 999 for team in tie.tournament.teams}
        tie.winner_team_id = min((tie.team1_id, tie.team2_id), key=lambda team_id: seeds.get(team_id, 999))
    else:
        tie.winner_team_id = None
    tie.is_completed = True
    return True


def calculate_team_standings(teams: List[models.TournamentTeam], ties: List[models.TeamTie], swiss: bool = False) -> List[TeamStanding]:
    standings = {
        team.id: TeamStanding(team.id, team.name, team.seed or 999)
        for team in teams
    }
    completed_ties = [tie for tie in ties if tie.is_completed]

    for tie in completed_ties:
        t1, t2 = tie.team1_id, tie.team2_id
        if t1 not in standings:
            continue
        s1, s2 = standings[t1], standings[t2]
        s1.matches_played += 1
        if t2 is None:
            s1.matches_won += 1
            s1.match_points += 1.0
            s1.games_won += 2
            continue
        if t2 not in standings:
            s1.matches_played -= 1
            continue
        s2.matches_played += 1
        s1.opponents_played.append(t2)
        s2.opponents_played.append(t1)
        totals = team_tie_totals(tie)
        for row, team_id in ((s1, t1), (s2, t2)):
            row.games_won += totals[team_id]["games_won"]
            row.games_lost += totals[team_id]["games_lost"]
            row.points_won += totals[team_id]["points_won"]
            row.points_lost += totals[team_id]["points_lost"]
        if tie.is_draw:
            s1.matches_drawn += 1
            s2.matches_drawn += 1
            s1.match_points += 1.0
            s2.match_points += 1.0
        elif tie.winner_team_id == t1:
            s1.matches_won += 1
            s2.matches_lost += 1
            s1.match_points += 1.0
        elif tie.winner_team_id == t2:
            s2.matches_won += 1
            s1.matches_lost += 1
            s2.match_points += 1.0

    if swiss:
        for row in standings.values():
            row.buchholz = sum(standings[opponent].match_points for opponent in row.opponents_played)
            for opponent in row.opponents_played:
                tie = next((tie for tie in completed_ties if {tie.team1_id, tie.team2_id} == {row.team_id, opponent}), None)
                if tie and tie.winner_team_id == row.team_id:
                    row.sonneborn_berger += standings[opponent].match_points
                elif tie and tie.is_draw:
                    row.sonneborn_berger += standings[opponent].match_points / 2
        ordered = sorted(standings.values(), key=lambda row: (
            -row.match_points, -row.buchholz, -row.sonneborn_berger,
            -row.game_difference, -row.point_difference, row.seed, row.team_id,
        ))
    else:
        def resolve_group(ids: List[str], criteria_index: int = 0) -> List[TeamStanding]:
            if len(ids) <= 1:
                return [standings[team_id] for team_id in ids]
            if len(ids) == 2:
                head_to_head = next((tie for tie in completed_ties if {tie.team1_id, tie.team2_id} == set(ids)), None)
                if head_to_head and head_to_head.winner_team_id:
                    ids = sorted(ids, key=lambda team_id: team_id != head_to_head.winner_team_id)
                else:
                    ids = sorted(ids, key=lambda team_id: (
                        -standings[team_id].game_difference,
                        -standings[team_id].point_difference,
                        standings[team_id].seed,
                        team_id,
                    ))
                return [standings[team_id] for team_id in ids]
            if criteria_index >= 2:
                return [standings[team_id] for team_id in sorted(ids, key=lambda team_id: (standings[team_id].seed, team_id))]
            key = (lambda team_id: standings[team_id].game_difference) if criteria_index == 0 else (lambda team_id: standings[team_id].point_difference)
            partitions: Dict[int, List[str]] = {}
            for team_id in ids:
                partitions.setdefault(key(team_id), []).append(team_id)
            if len(partitions) == 1:
                return resolve_group(ids, criteria_index + 1)
            result: List[TeamStanding] = []
            for value in sorted(partitions, reverse=True):
                result.extend(resolve_group(partitions[value], criteria_index + 1))
            return result

        by_match_points: Dict[float, List[str]] = {}
        for team_id, row in standings.items():
            by_match_points.setdefault(row.match_points, []).append(team_id)
        ordered = []
        for points in sorted(by_match_points, reverse=True):
            ordered.extend(resolve_group(by_match_points[points]))

    for index, row in enumerate(ordered, start=1):
        row.rank = index
    return ordered
