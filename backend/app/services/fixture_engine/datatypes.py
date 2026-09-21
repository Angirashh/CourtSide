from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

class MatchStage(str, Enum):
    GROUP = "GROUP"
    SWISS = "SWISS"
    KNOCKOUT = "KNOCKOUT"

@dataclass
class Player:
    id: str
    name: str
    seed: int
    points: float = 0.0
    games_won: int = 0
    games_lost: int = 0
    points_won: int = 0
    points_lost: int = 0
    opponents_played: set[str] = field(default_factory=set)
    received_bye: bool = False

    @property
    def score_differential(self) -> int:
        return self.points_won - self.points_lost

@dataclass
class Match:
    id: str
    round_num: int
    stage: MatchStage
    player1_id: str
    player2_id: Optional[str]  # None indicates a Bye
    group_id: Optional[str] = None
    winner_id: Optional[str] = None
    is_completed: bool = False

    @property
    def is_bye(self) -> bool:
        return self.player2_id is None