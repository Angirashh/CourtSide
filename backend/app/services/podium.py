from typing import List, Optional, Tuple

from app.db import models


def compute_podium(matches: List[models.Match]) -> Tuple[Optional[str], Optional[str]]:
    """
    Reads 1st/2nd place player ids off the completed final (the last-round KNOCKOUT match) —
    both supported formats (GROUP_KNOCKOUT, SWISS_KNOCKOUT) always end in a single knockout
    final. Returns (None, None) if there's no knockout stage, or the final hasn't actually
    been played yet (e.g. a tournament marked COMPLETED before its last match was scored).
    Mirrors finalPodium in frontend/src/lib/utils.ts; keep the two in sync.
    """
    ko_rounds = [m.round_num for m in matches if m.stage == models.MatchStage.KNOCKOUT]
    if not ko_rounds:
        return None, None
    max_round = max(ko_rounds)
    final = next((m for m in matches if m.stage == models.MatchStage.KNOCKOUT and m.round_num == max_round), None)
    if not final or not final.is_completed or final.is_bye or not final.winner_id:
        return None, None
    second = final.player2_id if final.player1_id == final.winner_id else final.player1_id
    return final.winner_id, second
