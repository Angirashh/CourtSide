from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from app.schemas.match import MatchResponse


class PlayerBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, examples=["Viktor Axelsen"])
    seed: Optional[int] = Field(None, ge=1, examples=[1])
    is_placeholder: bool = Field(default=False, description="True for TBD slots")


class PlayerCreate(PlayerBase):
    pass


class PlayerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    seed: Optional[int] = Field(None, ge=1)
    is_placeholder: Optional[bool] = None


class PlayerResponse(PlayerBase):
    id: str
    tournament_id: str
    is_withdrawn: bool = False
    withdrawn_at: Optional[datetime] = None
    withdrawal_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PlayerBatchCreate(BaseModel):
    players: List[PlayerCreate]


class PlayerWithdrawRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=300, examples=["Ankle injury during warmup"])


class PlayerWithdrawResponse(BaseModel):
    player: PlayerResponse
    walkover_matches: List[MatchResponse] = Field(
        default_factory=list,
        description="Matches immediately auto-completed in the withdrawn player's opponent's favor."
    )