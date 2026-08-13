import os
import sqlite3


def get_custom_provider_sync(provider_id: str) -> dict | None:
    db_url = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///sprintlogic.db")
    db_path = db_url.replace("sqlite+aiosqlite:///", "")
    if db_path == db_url:
        db_path = "sprintlogic.db"

    if not os.path.exists(db_path):
        return None

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name, base_url, keyring_service_id FROM custom_llm_providers WHERE id = ?",
            (provider_id,),
        )
        row = cursor.fetchone()
        if row:
            return {"name": row[0], "base_url": row[1], "keyring_service_id": row[2]}
    except sqlite3.OperationalError:
        return None
    finally:
        conn.close()
    return None
