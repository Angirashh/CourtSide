from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

database_url = settings.DATABASE_URL

# Fix legacy 'postgres://' prefix if Supabase provides it
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

if database_url.startswith("sqlite"):
    # FastAPI runs sync route handlers in a threadpool, but a single sqlite3
    # connection can only be used from the thread that opened it by default.
    engine = create_engine(database_url, connect_args={"check_same_thread": False})
else:
    # Cloud-optimized pool settings
    engine = create_engine(
        database_url,
        pool_pre_ping=True,      # Tests connection liveness before every query
        pool_recycle=300,        # Recycles connections every 5 minutes to avoid idle drops
        pool_size=10,            # Base connection pool size
        max_overflow=20          # Max extra connections during heavy loads
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """Dependency providing a DB session per FastAPI request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()