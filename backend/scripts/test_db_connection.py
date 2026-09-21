from sqlalchemy import text
from app.db.session import engine, SessionLocal
from app.db.models import Base

def test_supabase_connection():
    print("=" * 70)
    print("🔌 TESTING SUPABASE POSTGRESQL CONNECTION")
    print("=" * 70)

    try:
        # 1. Test basic connectivity
        with engine.connect() as connection:
            result = connection.execute(text("SELECT version();"))
            db_version = result.scalar()
            print(f"✅ Successfully connected to Supabase!")
            print(f"📦 PostgreSQL Version: {db_version}\n")

        # 2. Push tables to Supabase
        print("Creating tables in Supabase (tournaments, courts, players, matches)...")
        Base.metadata.create_all(bind=engine)
        print("✅ Tables created successfully!")

        # 3. Check table presence
        with engine.connect() as connection:
            tables_query = text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public';
            """)
            tables = [row[0] for row in connection.execute(tables_query)]
            print(f"📋 Public tables in database: {', '.join(tables)}")

    except Exception as e:
        print(f"❌ Connection failed: {str(e)}")
        print("\nTroubleshooting tips:")
        print("1. Did you replace [YOUR-PASSWORD] in .env with your actual Supabase DB password?")
        print("2. Ensure '?sslmode=require' is appended at the end of the DATABASE_URL.")
        print("3. Try using port 5432 (Session Pooler) instead of 6543 (Transaction Pooler).")

if __name__ == "__main__":
    test_supabase_connection()