import pymysql
from app.core.config import settings

def main():
    print(f"Connecting to database: host={settings.db_host}, user={settings.db_user}, db={settings.db_name}")
    conn = pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name
    )
    try:
        with conn.cursor() as cursor:
            # Check if table exists
            cursor.execute("SHOW TABLES LIKE 'alembic_version'")
            table_exists = cursor.fetchone()
            if not table_exists:
                print("alembic_version table does not exist. Creating it...")
                cursor.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)")
                cursor.execute("INSERT INTO alembic_version VALUES ('0009_stock_count')")
            else:
                cursor.execute("SELECT version_num FROM alembic_version")
                current = cursor.fetchall()
                print(f"Current version(s) in database: {current}")
                cursor.execute("DELETE FROM alembic_version")
                cursor.execute("INSERT INTO alembic_version VALUES ('0009_stock_count')")
            conn.commit()
            print("Successfully stamped database to '0009_stock_count'")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
