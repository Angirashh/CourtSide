from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from app.db.models import MatchStage, MatchStatus


class GameScore(BaseModel):
    """Represents the rally score for an individual set/game."""
    p1: int = Field(..., ge=0, examples=[21])
    p2: int = Field(..., ge=0, examples=[18])


class MatchBase(BaseModel):
    stage: MatchStage
    round_num: int = Field(..., ge=1, examples=[1])
    group_id: Optional[str] = Field(None, examples=["Group_A"])
    player1_id: Optional[str] = None
    player2_id: Optional[str] = None


class MatchScoreSubmission(BaseModel):
    """Payload for court operators to submit match results."""
    winner_id: str
    scores: List[GameScore] = Field(
        ...,
        min_length=1,
        max_length=3,
        description="Set scores for best of 3 games",
        examples=[[{"p1": 21, "p2": 19}, {"p1": 21, "p2": 15}]]
    )


class MatchScheduleUpdate(BaseModel):
    """Payload used by the CP-SAT scheduler to attach times and courts."""
    court_id: str
    scheduled_start_time: datetime
    scheduled_end_time: datetime


class MatchResponse(MatchBase):
    id: str
    tournament_id: str
    winner_id: Optional[str] = None
    court_id: Optional[str] = None
    scheduled_start_time: Optional[datetime] = None
    scheduled_end_time: Optional[datetime] = None
    status: MatchStatus
    actual_start_time: Optional[datetime] = None
    actual_end_time: Optional[datetime] = None
    is_completed: bool
    is_bye: bool
    is_walkover: bool = False
    scores: Optional[List[dict]] = None

    model_config = ConfigDict(from_attributes=True)