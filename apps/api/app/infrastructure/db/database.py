from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

DB_DIR = Path.home() / ".local" / "share" / "sprintlogic"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / "sprintlogic.db"

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite+aiosqlite:///{DB_PATH}",
)


class Base(DeclarativeBase):
    pass


import sqlite_vec

engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={
        "check_same_thread": False,
        "timeout": 15,
    },
)


@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _connection_record):
    """Enable WAL mode and NORMAL sync for concurrent async access."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


AsyncSessionLocal = async_sessionmaker(
    bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        conn = await session.connection()
        raw = await conn.get_raw_connection()
        aiosqlite_conn = raw.driver_connection

        if not getattr(aiosqlite_conn, "_vec_loaded", False):
            await aiosqlite_conn.enable_load_extension(True)
            await aiosqlite_conn.load_extension(sqlite_vec.loadable_path())
            await aiosqlite_conn.enable_load_extension(False)
            aiosqlite_conn._vec_loaded = True

        yield session


async def init_fts5() -> None:
    """Create FTS5 virtual tables for search and agent memory."""
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5("
                "  type, name, path, content, line UNINDEXED"
                ")"
            )
        )
        await conn.execute(
            text(
                "CREATE VIRTUAL TABLE IF NOT EXISTS project_memories USING fts5("
                "  project_id UNINDEXED, agent_name, context_type, memory_content"
                ")"
            )
        )
