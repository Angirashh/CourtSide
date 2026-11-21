from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Tournament Management Engine"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = Field(
        default="sqlite:///./tournament_app.db",
        description="SQLAlchemy database connection URI (Supabase PostgreSQL / SQLite)"
    )

    # Live-update listener (app/services/live_listener.py). Must be a SESSION-mode Postgres
    # connection (e.g. Supabase's Supavisor pooler on port 5432, not the transaction-mode
    # pooler on 6543 that DATABASE_URL uses) -- LISTEN needs one dedicated connection held open,
    # which transaction pooling can't guarantee. Left blank, the listener simply never starts
    # (safe default for local SQLite dev and tests) and spectators fall back to polling only.
    LISTEN_DATABASE_URL: str = Field(
        default="", description="Session-mode Postgres URL used to LISTEN for live score updates."
    )

    # Celery & Redis
    CELERY_BROKER_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL for Celery task queuing"
    )

    # Auth
    JWT_SECRET_KEY: str = Field(
        default="dev-insecure-secret-change-me",
        description="Signing key for access tokens. MUST be overridden via env/.env in production."
    )
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 12  # 12 hours, spans a typical tournament day

    # Player sign-in. Google is the live path; MSG91 OTP is wired but dormant, kept for when
    # phone-based sign-in is reintroduced at scale.
    GOOGLE_CLIENT_ID: str = Field(
        default="", description="OAuth 2.0 Web Client ID from Google Cloud Console, used to verify player sign-in tokens."
    )
    MSG91_AUTH_KEY: str = Field(default="", description="Auth key from the MSG91 dashboard.")
    MSG91_OTP_TEMPLATE_ID: str = Field(default="", description="OTP SMS template ID configured in MSG91.")

    # Error tracking. Left blank, Sentry simply never initializes (see app/main.py) -- safe
    # default for local dev, so nobody needs a Sentry account just to run the app.
    SENTRY_DSN: str = Field(default="", description="Sentry project DSN. Blank disables error tracking entirely.")
    SENTRY_ENVIRONMENT: str = Field(default="development", description="Tag shown on every Sentry event, e.g. 'production'.")

    # CORS configuration
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "*"
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"  # Prevents crashes if extra variables exist in .env
    )


settings = Settings()