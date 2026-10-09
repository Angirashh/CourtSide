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
    """Same create_all limitation as above, for the athlete_id link self-service PLAYER accounts
    need, on a `users` table that predates this feature."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("users")}
    with engine.begin() as conn:
        if "athlete_id" not in existing:
            conn.execute(text("ALTER TABLE users ADD COLUMN athlete_id VARCHAR"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_athlete_id ON users (athlete_id)"))


def ensure_player_name_columns(engine: Engine) -> None:
    """Same create_all limitation as above, for `first_name`/`last_name` added when PLAYER
    sign-in moved from Google (one name string) to a phone.email signup form that asks for
    both separately. Intentionally doesn't touch the now-unused `google_sub` column/index
    still sitting on a live deployment's `users` table — this file only ever adds, never drops,
    so that orphan is left in place rather than risking a destructive migration."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("users")}
    with engine.begin() as conn:
        if "first_name" not in existing:
            conn.execute(text("ALTER TABLE users ADD COLUMN first_name VARCHAR"))
        if "last_name" not in existing:
            conn.execute(text("ALTER TABLE users ADD COLUMN last_name VARCHAR"))


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


def ensure_team_friendly_enum_values(engine: Engine) -> None:
    """
    Postgres enum columns compile to a native, rigid ENUM TYPE — `Base.metadata.create_all()`
    only creates tables that don't exist yet, it never alters an existing type's allowed values.
    TEAM_FRIENDLY (on TournamentFormat) and CROSSOVER (on MatchStage) were both added to the
    Python enums after production's `tournamentformat`/`matchstage` types already existed, so
    without this, inserting either value fails at the database level with "invalid input value
    for enum ..." — a 500 on tournament creation (format) or schedule generation (stage) for this
    format specifically, while every other format keeps working fine. SQLite (local dev/tests)
    has no native enum type — these are just strings there — so this is a no-op off Postgres.
    """
    if engine.dialect.name != "postgresql":
        return
    # Run outside any transaction block: ADD VALUE's historical restriction is on using the new
    # value within the same transaction it was added in, and autocommit sidesteps any ambiguity
    # about that across Postgres versions/drivers rather than relying on engine.begin().
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text("ALTER TYPE tournamentformat ADD VALUE IF NOT EXISTS 'TEAM_FRIENDLY'"))
        conn.execute(text("ALTER TYPE matchstage ADD VALUE IF NOT EXISTS 'CROSSOVER'"))


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


def ensure_tournament_registration_columns(engine: Engine) -> None:
    """Same create_all limitation as above, for the organiser-controlled public-registration
    gate (`registration_open`) and roster cap (`max_players`) on a `tournaments` table that
    predates them. `registration_open` defaults TRUE so every tournament that already exists
    keeps behaving exactly as it did before this flag existed (registration implicitly open
    at DRAFT/SCHEDULING)."""
    inspector = inspect(engine)
    if "tournaments" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("tournaments")}
    with engine.begin() as conn:
        if "registration_open" not in existing:
            conn.execute(text("ALTER TABLE tournaments ADD COLUMN registration_open BOOLEAN NOT NULL DEFAULT TRUE"))
        if "max_players" not in existing:
            conn.execute(text("ALTER TABLE tournaments ADD COLUMN max_players INTEGER"))


def ensure_tournament_registration_status_column(engine: Engine) -> None:
    """
    Upgrades the two-state `registration_open` boolean to the three-state
    `registration_status` (NOT_OPEN / OPEN / CLOSED) a tournament now needs, since "closed
    by the organiser" and "never opened yet" are different player-facing messages but both
    used to be `registration_open = False`. Backfills from the legacy boolean column so
    every existing tournament keeps its current open/closed behaviour; the legacy column is
    left in place afterwards, unused, following this file's "only ever add" convention.
    """
    inspector = inspect(engine)
    if "tournaments" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("tournaments")}
    if "registration_status" in existing:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE tournaments ADD COLUMN registration_status VARCHAR NOT NULL DEFAULT 'OPEN'"))
        if "registration_open" in existing:
            conn.execute(text(
                "UPDATE tournaments SET registration_status = CASE WHEN registration_open "
                "THEN 'OPEN' ELSE 'NOT_OPEN' END"
            ))
