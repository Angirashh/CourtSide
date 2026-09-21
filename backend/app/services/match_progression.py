from datetime import datetime
from typing import List, Optional, Set
from sqlalchemy.orm import Session

from app.db import models
from app.services.fixture_engine.datatypes import (
    Player as EnginePlayer,
    Match as EngineMatch,
    MatchStage as EngineMatchStage,
)
from app.services.fixture_engine.fixture_engine import FixtureEngine
from app.services.standings import StandingsEngine


def finalize_match_result(
    match: models.Match,
    winner_id: str,
    db: Session,
    scores: Optional[List[dict]] = None,
    is_walkover: bool = False,
) -> None:
    """
    Single entry point for resolving a match, whether by a real submitted score or an
    automatic walkover. Handles knockout winner propagation and group/Swiss stage
    transitions identically either way.
    """
    match.winner_id = winner_id
    match.scores = scores
    match.is_completed = True
    match.status = models.MatchStatus.COMPLETED
    match.actual_end_time = datetime.utcnow()
    match.is_walkover = is_walkover
    db.flush()

    _propagate_knockout_winner(match, db)
    if match.stage == models.MatchStage.GROUP:
        _check_and_transition_groups(match.tournament_id, db)
    elif match.stage == models.MatchStage.SWISS:
        _check_and_transition_swiss(match.tournament_id, match.round_num, db)


def resolve_pending_walkovers(tournament_id: str, db: Session) -> List[models.Match]:
    """
    Auto-completes any pending match where both participants are resolved (non-TBD)
    players and exactly one of them has withdrawn. Runs to a fixed point, since
    walking over one match can propagate a winner into a downstream match that is
    itself now resolvable (e.g. the new opponent also withdrew).

    Matches where BOTH participants have withdrawn are left pending — there's no
    winner to advance automatically, and that's rare enough to need an organiser's
    manual call instead of a guessed one.
    """
    withdrawn_ids = {
        row[0] for row in db.query(models.Player.id).filter(
            models.Player.tournament_id == tournament_id,
            models.Player.is_withdrawn == True,
        ).all()
    }
    if not withdrawn_ids:
        return []

    resolved: List[models.Match] = []
    while True:
        pending = db.query(models.Match).filter(
            models.Match.tournament_id == tournament_id,
            models.Match.is_completed == False,
            models.Match.player1_id.isnot(None),
            models.Match.player2_id.isnot(None),
        ).all()

        progressed = False
        for match in pending:
            p1, p2 = match.player1_id, match.player2_id
            # Re-check freshly: an earlier match finalized in this same pass may have
            # mutated this object in place (e.g. a cascading round transition that
            # turned an unresolved slot into a bye, i.e. player_id -> None).
            if match.is_completed or p1 is None or p2 is None or p1.startswith("TBD") or p2.startswith("TBD"):
                continue

            p1_out, p2_out = p1 in withdrawn_ids, p2 in withdrawn_ids
            if p1_out == p2_out:
                continue  # neither withdrew, or both did (unresolvable automatically)

            winner_id = p2 if p1_out else p1
            finalize_match_result(match, winner_id, db, scores=None, is_walkover=True)
            resolved.append(match)
            progressed = True

        if not progressed:
            break

    return resolved


# =====================================================================
# WINNER PROPAGATION & GROUP STAGE TRANSITION
# =====================================================================
def _propagate_knockout_winner(completed_match: models.Match, db: Session):
    """Replaces downstream knockout placeholders with the winner of the completed match."""
    tournament_id = completed_match.tournament_id

    # Strip tournament_id prefix to get the base match key (e.g., 'KO_R1_M1')
    match_suffix = completed_match.id
    if match_suffix.startswith(f"{tournament_id}_"):
        match_suffix = match_suffix[len(tournament_id) + 1:]

    candidates: Set[str] = {
        f"TBD_{match_suffix}_Win",
        f"{tournament_id}_TBD_{match_suffix}_Win",
    }

    # If match starts with KO_, also check without prefix (e.g., 'KO_R1_M1' -> 'R1_M1')
    if match_suffix.startswith("KO_"):
        stripped = match_suffix[3:]
        candidates.add(f"TBD_{stripped}_Win")
        candidates.add(f"{tournament_id}_TBD_{stripped}_Win")

    # Map Semifinals (Knockout Round 1) to TBD_SF1_Win / TBD_SF2_Win
    if completed_match.stage == models.MatchStage.KNOCKOUT and completed_match.round_num == 1:
        ko_r1_matches = db.query(models.Match).filter(
            models.Match.tournament_id == tournament_id,
            models.Match.stage == models.MatchStage.KNOCKOUT,
            models.Match.round_num == 1
        ).order_by(models.Match.id.asc()).all()

        for m_idx, m in enumerate(ko_r1_matches, start=1):
            if m.id == completed_match.id:
                candidates.add(f"TBD_SF{m_idx}_Win")
                candidates.add(f"{tournament_id}_TBD_SF{m_idx}_Win")

    downstream_matches = db.query(models.Match).filter(
        models.Match.tournament_id == tournament_id,
        models.Match.stage == models.MatchStage.KNOCKOUT,
        (models.Match.player1_id.in_(candidates)) | (models.Match.player2_id.in_(candidates))
    ).all()

    for d_match in downstream_matches:
        if d_match.player1_id in candidates:
            d_match.player1_id = completed_match.winner_id
        if d_match.player2_id in candidates:
            d_match.player2_id = completed_match.winner_id

    db.flush()


def _check_and_transition_groups(tournament_id: str, db: Session):
    """Calculates pool standings and advances top 2 of each group (excluding withdrawals) to Knockout."""
    remaining_group_matches = db.query(models.Match).filter(
        models.Match.tournament_id == tournament_id,
        models.Match.stage == models.MatchStage.GROUP,
        models.Match.is_completed == False
    ).count()

    if remaining_group_matches == 0:
        players = db.query(models.Player).filter(
            models.Player.tournament_id == tournament_id,
            models.Player.is_placeholder == False
        ).all()
        withdrawn_ids = {p.id for p in players if p.is_withdrawn}

        all_group_matches = db.query(models.Match).filter(
            models.Match.tournament_id == tournament_id,
            models.Match.stage == models.MatchStage.GROUP
        ).all()

        groups = set(m.group_id for m in all_group_matches if m.group_id)
        qualifiers = []

        for gid in sorted(groups):
            pool_matches = [m for m in all_group_matches if m.group_id == gid]
            pool_player_ids = {m.player1_id for m in pool_matches} | {m.player2_id for m in pool_matches}

            pool_players = [
                EnginePlayer(id=p.id, name=p.name, seed=p.seed or 99)
                for p in players if p.id in pool_player_ids
            ]

            engine_matches = [
                EngineMatch(
                    id=m.id,
                    round_num=m.round_num,
                    stage=EngineMatchStage.GROUP,
                    group_id=m.group_id,
                    player1_id=m.player1_id,
                    player2_id=m.player2_id,
                    winner_id=m.winner_id,
                    is_completed=m.is_completed
                )
                for m in pool_matches
            ]

            standings = StandingsEngine.calculate_group_standings(pool_players, engine_matches, group_id=gid)
            # A withdrawn player's played matches still count toward everyone else's standings,
            # but they themselves can't advance even if their frozen record would qualify them.
            eligible_standings = [s for s in standings if s.player_id not in withdrawn_ids]
            for s in eligible_standings[:2]:
                qualifiers.append(s.player_id)

        for idx, qual_id in enumerate(qualifiers, start=1):
            seed_placeholders = [
                f"TBD_Seed_{idx}",
                f"{tournament_id}_TBD_Seed_{idx}",
                f"TBD_Seed{idx}",
                f"{tournament_id}_TBD_Seed{idx}",
            ]

            ko_matches = db.query(models.Match).filter(
                models.Match.tournament_id == tournament_id,
                models.Match.stage == models.MatchStage.KNOCKOUT,
                (models.Match.player1_id.in_(seed_placeholders)) |
                (models.Match.player2_id.in_(seed_placeholders))
            ).all()

            for km in ko_matches:
                if km.player1_id in seed_placeholders:
                    km.player1_id = qual_id
                if km.player2_id in seed_placeholders:
                    km.player2_id = qual_id

        db.flush()


# =====================================================================
# SWISS ROUND AUTOMATION & TIEBREAKING
# =====================================================================
def _check_and_transition_swiss(tournament_id: str, current_round: int, db: Session):
    """
    Checks if all matches in the current Swiss round have completed.
    - If yes & more Swiss rounds remain: generates Round N+1 pairings and populates court slots.
    - If yes & final Swiss round: seeds top qualifiers into the Knockout stage.
    Withdrawn players are excluded from future pairing/qualification, but their already
    -completed matches still feed everyone else's Buchholz/Sonneborn-Berger tiebreaks.
    """
    remaining_in_round = db.query(models.Match).filter(
        models.Match.tournament_id == tournament_id,
        models.Match.stage == models.MatchStage.SWISS,
        models.Match.round_num == current_round,
        models.Match.is_completed == False
    ).count()

    if remaining_in_round > 0:
        return  # Other matches in this round are still ongoing

    real_players = db.query(models.Player).filter(
        models.Player.tournament_id == tournament_id,
        models.Player.is_placeholder == False
    ).all()
    withdrawn_ids = {p.id for p in real_players if p.is_withdrawn}

    completed_swiss_matches = db.query(models.Match).filter(
        models.Match.tournament_id == tournament_id,
        models.Match.stage == models.MatchStage.SWISS,
        models.Match.is_completed == True
    ).all()

    engine_players = [
        EnginePlayer(id=p.id, name=p.name, seed=p.seed or 99)
        for p in real_players
    ]

    engine_matches = [
        EngineMatch(
            id=m.id,
            round_num=m.round_num,
            stage=EngineMatchStage.SWISS,
            player1_id=m.player1_id,
            player2_id=m.player2_id,
            winner_id=m.winner_id,
            is_completed=m.is_completed
        )
        for m in completed_swiss_matches
    ]

    standings = StandingsEngine.calculate_swiss_standings(engine_players, engine_matches)

    max_round_row = db.query(models.Match.round_num).filter(
        models.Match.tournament_id == tournament_id,
        models.Match.stage == models.MatchStage.SWISS
    ).order_by(models.Match.round_num.desc()).first()

    if not max_round_row:
        return

    max_swiss_round = max_round_row[0]
    next_round = current_round + 1

    if next_round <= max_swiss_round:
        # -------------------------------------------------------------
        # CASE A: Generate Next Swiss Round Pairings (withdrawn players excluded)
        # -------------------------------------------------------------
        # The pairing engine needs each player's real score, opponent history and bye
        # history; without them every round would be paired as if it were round 1.
        standing_by_id = {s.player_id: s for s in standings}
        bye_recipients = {
            m.player1_id for m in completed_swiss_matches if m.is_bye and m.player1_id
        }
        for p in engine_players:
            st = standing_by_id[p.id]
            p.points = st.match_points
            p.games_won = st.games_won
            p.games_lost = st.games_lost
            p.points_won = st.points_won
            p.points_lost = st.points_lost
            p.opponents_played = set(st.opponents_played)
            p.received_bye = p.id in bye_recipients

        standing_order = {s.player_id: idx for idx, s in enumerate(standings)}
        pairing_players = [p for p in engine_players if p.id not in withdrawn_ids]
        pairing_players.sort(key=lambda p: standing_order.get(p.id, 999))

        engine = FixtureEngine()
        next_fixtures = engine.generate_swiss_round(
            players=pairing_players,
            round_num=next_round
        )
        bye_fixture = next((f for f in next_fixtures if f.is_bye), None)
        # Best-ranked pairings take the earliest court slots.
        played_fixtures = sorted(
            (f for f in next_fixtures if not f.is_bye),
            key=lambda f: min(standing_order.get(f.player1_id, 999), standing_order.get(f.player2_id, 999)),
        )

        round_slots = db.query(models.Match).filter(
            models.Match.tournament_id == tournament_id,
            models.Match.stage == models.MatchStage.SWISS,
            models.Match.round_num == next_round
        ).order_by(models.Match.scheduled_start_time.asc(), models.Match.id.asc()).all()
        play_slots = [m for m in round_slots if not m.is_bye]
        bye_slots = [m for m in round_slots if m.is_bye]
        if bye_fixture and not bye_slots and len(play_slots) > len(played_fixtures):
            # Schedules generated before bye slots existed pad every round to an even field.
            spare = play_slots.pop()
            spare.is_bye = True
            bye_slots.append(spare)

        for slot, fixture in zip(play_slots, played_fixtures):
            slot.player1_id = fixture.player1_id
            slot.player2_id = fixture.player2_id

        if bye_fixture and bye_slots:
            bye_slot = bye_slots.pop(0)
            bye_slot.player1_id = bye_fixture.player1_id
            bye_slot.player2_id = None
            bye_slot.is_completed = True
            bye_slot.status = models.MatchStatus.COMPLETED
            bye_slot.winner_id = bye_fixture.player1_id

        # A withdrawal shrinks the field, so some pre-built slots may have no fixture left
        # to hold; drop them so the round can actually finish.
        for unused in play_slots[len(played_fixtures):] + bye_slots:
            db.delete(unused)

        db.flush()

    else:
        # -------------------------------------------------------------
        # CASE B: Final Swiss Round Completed -> Populate Knockout (withdrawn players excluded)
        # -------------------------------------------------------------
        qualifying_standings = [s for s in standings if s.player_id not in withdrawn_ids]
        for rank_idx, standing in enumerate(qualifying_standings, start=1):
            seed_placeholders = [
                f"TBD_Seed{rank_idx}",
                f"{tournament_id}_TBD_Seed{rank_idx}",
                f"TBD_Seed_{rank_idx}",
                f"{tournament_id}_TBD_Seed_{rank_idx}",
            ]

            ko_matches = db.query(models.Match).filter(
                models.Match.tournament_id == tournament_id,
                models.Match.stage == models.MatchStage.KNOCKOUT,
                (models.Match.player1_id.in_(seed_placeholders)) |
                (models.Match.player2_id.in_(seed_placeholders))
            ).all()

            for km in ko_matches:
                if km.player1_id in seed_placeholders:
                    km.player1_id = standing.player_id
                if km.player2_id in seed_placeholders:
                    km.player2_id = standing.player_id

        db.flush()
