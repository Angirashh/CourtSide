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