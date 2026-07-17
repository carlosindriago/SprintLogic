import asyncio

import sqlite_vec  # type: ignore
from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine

engine = create_async_engine("sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False})

@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _connection_record):
    raw_sqlite3 = dbapi_connection._connection._conn
    print("Raw sqlite3 type:", type(raw_sqlite3))
    raw_sqlite3.enable_load_extension(True)
    raw_sqlite3.load_extension(sqlite_vec.loadable_path())
    raw_sqlite3.enable_load_extension(False)
    print("Loaded sqlite-vec synchronously!")

async def main():
    async with engine.begin() as conn:
        res = await conn.execute(
            __import__('sqlalchemy').text("SELECT vec_version()")
        )
        print("VEC VERSION:", res.scalar())

asyncio.run(main())
