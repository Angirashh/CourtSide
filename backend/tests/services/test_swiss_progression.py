import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.routes_tournaments import _build_swiss_template_matches, default_swiss_rounds
from app.db import models
from app.services.fixture_engine.datatypes import Player as EnginePlayer
from app.services.fixture_engine.fixture_engine import FixtureEngine
from app.services.match_progression import finalize_match_result

TID = "T1"


def _persist_swiss_tournament(db, num_players: int, num_rounds: int):
    db.add(models.Tournament(id=TID, name="Swiss test", format=models.TournamentFormat.SWISS_KNOCKOUT))
    for i in range(1, num_players + 1):
        db.add(models.Player(id=f"P{i}", tournament_id=TID, name=f"Player {i}", seed=i))
    db.flush()

    engine_players = [EnginePlayer(id=f"P{i}", name=f"Player {i}", seed=i) for i in range(1, num_players + 1)]
    template = _build_swiss_template_matches(engine_players, FixtureEngine(), num_swiss_rounds=num_rounds)

    def scoped(pid):
        return f"{TID}_{pid}" if pid and pid.startswith("TBD") else pid

    for m in template:
        for pid in (m.player1_id, m.player2_id):
            if pid and pid.startswith("TBD") and not db.get(models.Player, scoped(pid)):
                db.add(models.Player(id=scoped(pid), tournament_id=TID, name=pid, is_placeholder=True))
    db.flush()
    for m in template:
        db.add(models.Match(
            id=f"{TID}_{m.id}", tournament_id=TID, stage=models.MatchStage(m.stage.value),
            round_num=m.round_num, player1_id=scoped(m.player1_id), player2_id=scoped(m.player2_id),
            is_bye=m.is_bye, is_completed=m.is_completed,
            status=models.MatchStatus.COMPLETED if m.is_completed else models.MatchStatus.SCHEDULED,
            winner_id=m.winner_id if m.is_bye else None,
        ))
    db.commit()


def _round(db, n):
    return db.query(models.Match).filter(
        models.Match.tournament_id == TID, models.Match.stage == models.MatchStage.SWISS, models.Match.round_num == n
    ).all()


def _play_round(db, n):
    for m in _round(db, n):
        if not m.is_completed:
            finalize_match_result(m, m.player1_id, db)
    db.commit()


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    models.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def test_default_round_count():
    assert default_swiss_rounds(11) == 4
    assert default_swiss_rounds(8) == 3
    assert default_swiss_rounds(2) == 1


def test_later_rounds_never_repeat_earlier_pairings_or_byes(db):
    _persist_swiss_tournament(db, num_players=7, num_rounds=4)

    seen_pairs, byes = set(), []
    for rnd in range(1, 5):
        matches = _round(db, rnd)
        assert all(not m.player1_id.startswith(("T1_TBD", "TBD")) for m in matches), f"round {rnd} not resolved"
        playable = [m for m in matches if not m.is_bye]
        bye = [m for m in matches if m.is_bye]
        assert len(playable) == 3 and len(bye) == 1
        for m in playable:
            pair = frozenset({m.player1_id, m.player2_id})
            assert pair not in seen_pairs, f"round {rnd} repeats {sorted(pair)}"
            seen_pairs.add(pair)
        byes.append(bye[0].player1_id)
        assert bye[0].is_completed and bye[0].winner_id == bye[0].player1_id
        _play_round(db, rnd)

    assert len(set(byes)) == len(byes), "a player received a second bye"


def test_next_round_pairs_winners_together(db):
    _persist_swiss_tournament(db, num_players=8, num_rounds=3)
    r1 = _round(db, 1)
    winners = {m.player1_id for m in r1}
    _play_round(db, 1)

    for m in _round(db, 2):
        assert (m.player1_id in winners) == (m.player2_id in winners), "a winner was paired against a loser"


def test_bye_slot_is_not_a_court_slot_and_even_field_has_none(db):
    _persist_swiss_tournament(db, num_players=8, num_rounds=3)
    assert not any(m.is_bye for m in _round(db, 2))
    assert len(_round(db, 2)) == 4
