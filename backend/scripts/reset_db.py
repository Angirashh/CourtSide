from app.db.session import engine
from app.db.models import Base

def reset_database():
    print("🗑️  Dropping old tables...")
    # This will drop all tables defined in models.py (wipes dev data)
    Base.metadata.drop_all(bind=engine)
    
    print("✨ Creating new tables with updated schema...")
    Base.metadata.create_all(bind=engine)
    
    print("✅ Database reset complete!")

if __name__ == "__main__":
    reset_database()