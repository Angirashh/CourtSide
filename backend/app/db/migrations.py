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
