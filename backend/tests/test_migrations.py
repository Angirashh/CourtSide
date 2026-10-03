from contextlib import contextmanager

from app.db.migrations import ensure_team_friendly_enum_values


def test_noop_on_sqlite(db_session):
    """Local dev/tests run on SQLite, which has no native enum type — must not raise."""
    ensure_team_friendly_enum_values(db_session.get_bind())


class _FakeConnection:
    def __init__(self, sink):
        self.sink = sink

    def execute(self, stmt, *args, **kwargs):
        self.sink.append(str(stmt))

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class _FakeDialect:
    name = "postgresql"


class _FakeEngine:
    """Stands in for a Postgres engine without needing a real Postgres connection — captures
    the SQL ensure_team_friendly_enum_values would run so we can assert on it directly."""

    def __init__(self):
        self.dialect = _FakeDialect()
        self.executed = []

    def connect(self):
        return self

    def execution_options(self, **kwargs):
        return self

    def __enter__(self):
        return _FakeConnection(self.executed)

    def __exit__(self, *exc):
        return False


def test_issues_alter_type_statements_on_postgres():
    engine = _FakeEngine()
    ensure_team_friendly_enum_values(engine)

    assert any("tournamentformat" in s and "TEAM_FRIENDLY" in s for s in engine.executed)
    assert any("matchstage" in s and "CROSSOVER" in s for s in engine.executed)
