import pytest
from app.services.fixture_engine.datatypes import Player

@pytest.fixture
def generate_players():
    def _generate(count: int) -> list[Player]:
        return [
            Player(id=f"P{i}", name=f"Player {i}", seed=i)
            for i in range(1, count + 1)
        ]
    return _generate