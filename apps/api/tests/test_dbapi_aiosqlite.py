import asyncio

import sqlite_vec  # type: ignore
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = "sqlite+aiosqlite:///app.db"
engine = create_async_engine(DATABASE_URL, connect_args={"check_same_thread": False})

@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _connection_record):
    raw_sqlite3 = dbapi_connection._connection._conn
    raw_sqlite3.enable_load_extension(True)
    raw_sqlite3.load_extension(sqlite_vec.loadable_path())
    raw_sqlite3.enable_load_extension(False)
    print("Loaded sqlite-vec")

async def main():
    async with engine.begin() as conn:
        print("Creating FTS5 table...")
        await conn.execute(text("""
            CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
                id UNINDEXED,
                title,
                content,
                path UNINDEXED,
                type UNINDEXED,
                project_id UNINDEXED
            )
        """))
        print("Created FTS5 table.")
        res = await conn.execute(text("SELECT vec_version()"))
        print("VEC VERSION:", res.scalar())
        try:
            await conn.execute(text("SELECT * FROM search_index LIMIT 1"))
            print("search_index OK")
        except Exception as e:
            print("Error query search_index:", e)

asyncio.run(main())
