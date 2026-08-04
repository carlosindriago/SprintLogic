import asyncio

import pytest

# Fase 4 todo: this module is a debug/exploration script (no test_* functions,
# has top-level asyncio.run() that breaks pytest collection). Skip until purged.
pytest.skip("test_dbapi.py is a stray exploration script — broken, no test_* functions", allow_module_level=True)

from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine

engine = create_async_engine("sqlite+aiosqlite:///:memory:")

@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _connection_record):
    print("DIR:", dir(dbapi_connection))
    print("TYPE:", type(dbapi_connection))
    # Try to find the real sqlite3 connection
    if hasattr(dbapi_connection, "_connection"):
        print("_connection type:", type(dbapi_connection._connection))
        print("dir(_connection):", dir(dbapi_connection._connection))
    if hasattr(dbapi_connection, "dbapi_connection"):
        print("dbapi_connection:", type(dbapi_connection.dbapi_connection))

async def main():
    async with engine.begin() as conn:
        await conn.execute(engine.dialect.statement_compiler(engine.dialect, None).statement(None))
        pass

asyncio.run(main())
