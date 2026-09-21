from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import TournamentAppException, tournament_exception_handler
from app.db.models import Base
from app.db.session import engine
from app.api import routes_auth, routes_tournaments, routes_players, routes_matches, routes_athletes, routes_public


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create tables if they do not exist (useful for SQLite / local testing)
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown: Clean up resources if needed


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# 1. Register CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Register Custom Exception Handlers
app.add_exception_handler(TournamentAppException, tournament_exception_handler)

# 3. Mount Routers under /api/v1
app.include_router(routes_auth.router, prefix=settings.API_V1_STR)
app.include_router(routes_tournaments.router, prefix=settings.API_V1_STR)
app.include_router(routes_players.router, prefix=settings.API_V1_STR)
app.include_router(routes_matches.router, prefix=settings.API_V1_STR)
app.include_router(routes_athletes.router, prefix=settings.API_V1_STR)
app.include_router(routes_public.router, prefix=settings.API_V1_STR)


# 4. Root & Health Check Endpoints
@app.get("/", tags=["Health"])
def root():
    return {
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "documentation": "/docs"
    }


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy"}