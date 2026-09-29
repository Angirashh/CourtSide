from typing import Callable, List, Optional

from app.db import models


def build_round_label_fn(
    matches: List[models.Match],
) -> Callable[[models.MatchStage, int, Optional[str]], str]:
    """
    Returns a function labelling a match's round, e.g. "Swiss Round 2", "Group A Round 1",
    "Semi Finals", "Finals". Knockout rounds are named by position from the end of that
    tournament's bracket (not the raw round_num), since bracket size varies and round_num
    alone doesn't say how many rounds remain — so this needs the full match list up front.
    Mirrors matchRoundLabel in frontend/src/lib/utils.ts; keep the two in sync.
    """
    ko_rounds = sorted({m.round_num for m in matches if m.stage == models.MatchStage.KNOCKOUT})

    def label(stage: models.MatchStage, round_num: int, group_id: Optional[str]) -> str:
        if stage == models.MatchStage.SWISS:
            return f"Swiss Round {round_num}"
        if stage == models.MatchStage.GROUP:
            group_name = group_id.replace("_", " ") if group_id else "Group stage"
            return f"{group_name} Round {round_num}"
        if round_num not in ko_rounds:
            return f"Round {round_num}"
        from_end = len(ko_rounds) - ko_rounds.index(round_num)
        if from_end == 1:
            return "Finals"
        if from_end == 2:
            return "Semi Finals"
        if from_end == 3:
            return "Quarter Finals"
        return f"Round of {2 ** from_end}"

    return label
