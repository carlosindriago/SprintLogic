from __future__ import annotations

import os
from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///sprintlogic.db")

class Base(DeclarativeBase):
    pass

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None

def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            DATABASE_URL,
            echo=False,
            poolclass=NullPool if "sqlite" in DATABASE_URL else None,
            connect_args={"timeout": 30.0} if "sqlite" in DATABASE_URL else {}
        )

        @event.listens_for(_engine.sync_engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            if "sqlite" in DATABASE_URL:
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")
                cursor.execute("PRAGMA busy_timeout=30000")
                cursor.close()
    return _engine

def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _sessionmaker
    if _sessionmaker is None:
        engine = get_engine()
        _sessionmaker = async_sessionmaker(
            bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
        )
    return _sessionmaker

async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        yield session

# init_fts5 has been removed. Migrations are now handled by Alembic.
