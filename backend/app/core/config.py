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