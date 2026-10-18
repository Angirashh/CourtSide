from typing import List
from pydantic import BaseModel, Field
from app.schemas.match import GameScore


class TeamGameLineup(BaseModel):
    game_id: str
    player_ids: List[str] = Field(..., min_length=1, max_length=2)


class TeamLineupSubmission(BaseModel):
    games: List[TeamGameLineup]


class TeamGameScoreSubmission(BaseModel):
    winner_team_id: str
    scores: List[GameScore] = Field(..., min_length=1, max_length=3)
