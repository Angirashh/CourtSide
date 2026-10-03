import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.dependencies import get_db
from app.db.models import Base
from app.main import app
from app.services.fixture_engine.datatypes import Player

@pytest.fixture
def generate_players():
    def _generate(count: int) -> list[Player]:
        return [
            Player(id=f"P{i}", name=f"Player {i}", seed=i)
            for i in range(1, count + 1)
        ]
    return _generate


@pytest.fixture
def db_session():
    """An isolated in-memory SQLite DB per test. StaticPool keeps the same connection alive
    across the session/engine's lifetime — a plain in-memory SQLite DB is otherwise dropped
    the instant its one connection closes."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_session):
    """A TestClient wired to the real FastAPI app, with app.api.dependencies.get_db overridden
    to hand out the test's own in-memory db_session instead of a real Postgres/SQLite file."""

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()