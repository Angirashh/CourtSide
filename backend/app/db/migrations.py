from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def ensure_user_approval_columns(engine: Engine) -> None:
    """
    `Base.metadata.create_all()` (called at startup) only creates TABLES that don't exist yet —
    it never adds columns to a table that's already there. Supabase's `users` table predates
    `is_approved`/`is_superadmin`, so on an existing deployment those columns need an explicit
    ALTER TABLE or every query against `users` breaks. Idempotent: a no-op once the columns
    are present, and skipped entirely on a brand-new DB where create_all already added them.
    """
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("users")}
    with engine.begin() as conn:
        if "is_approved" not in existing:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT TRUE"))
        if "is_superadmin" not in existing:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_superadmin BOOLEAN NOT NULL DEFAULT FALSE"))


def ensure_tournament_venue_link_column(engine: Engine) -> None:
    """Same create_all limitation as above, for the `venue_link` column added after launch."""
    inspector = inspect(engine)
    if "tournaments" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("tournaments")}
    if "venue_link" not in existing:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tournaments ADD COLUMN venue_link VARCHAR"))


def ensure_player_auth_columns(engine: Engine) -> None:
    """Same create_all limitation as above, for the columns self-service PLAYER accounts need
    (the athlete_id link plus Google's stable account identifier) on a `users` table that
    predates this feature."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("users")}
    with engine.begin() as conn:
        if "athlete_id" not in existing:
            conn.execute(text("ALTER TABLE users ADD COLUMN athlete_id VARCHAR"))
        if "google_sub" not in existing:
            conn.execute(text("ALTER TABLE users ADD COLUMN google_sub VARCHAR"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_athlete_id ON users (athlete_id)"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL"))


def ensure_team_friendly_columns(engine: Engine) -> None:
    """Same create_all limitation as above, for the `team` column the TEAM_FRIENDLY format
    added to a `players` table that predates it."""
    inspector = inspect(engine)
    if "players" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("players")}
    with engine.begin() as conn:
        if "team" not in existing:
            conn.execute(text("ALTER TABLE players ADD COLUMN team VARCHAR"))


def ensure_court_available_from_column(engine: Engine) -> None:
    """Same create_all limitation as above, for `available_from_minutes` on a `courts` table
    that predates per-court staggered availability."""
    inspector = inspect(engine)
    if "courts" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("courts")}
    if "available_from_minutes" not in existing:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE courts ADD COLUMN available_from_minutes INTEGER NOT NULL DEFAULT 0"))
