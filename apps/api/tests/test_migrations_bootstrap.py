"""Regression tests for _run_migrations_bootstrap_sync's stamp/upgrade logic.

Covers the bug found while implementing the FTS5 migration (item #11): the
original design (stamp any unversioned database straight at "head") is only
safe for revisions that merely ALTER a schema Base.metadata.create_all()
already produces. The FTS5 migration creates virtual tables create_all()
cannot produce at all, so a fresh install must actually run it via
`upgrade head` from a `_CREATE_ALL_BASELINE_REVISION` stamp, not skip it via
a stamp straight to head.
"""

import asyncio
import sqlite3
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

import app.infrastructure.db.models  # noqa: F401  registers ORM classes
import app.main as main_module
from app.infrastructure.db.database import Base
from app.main import _CREATE_ALL_BASELINE_REVISION, _run_migrations_bootstrap_sync

_BASE_DIR = Path(main_module.__file__).resolve().parent.parent


@pytest.fixture
def db_url(tmp_path, monkeypatch):
    path = tmp_path / "bootstrap_test.db"
    url = f"sqlite+aiosqlite:///{path}"
    # env.py re-reads DATABASE_URL from the environment itself, ignoring
    # whatever the Config object was given - it must match for real.
    monkeypatch.setenv("DATABASE_URL", url)
    return url, path


async def _create_all(url: str) -> None:
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


@pytest.mark.asyncio
async def test_fresh_install_creates_fts5_tables_for_real(db_url):
    """A brand new database must not just be stamped past the FTS5 migration."""
    url, path = db_url
    await _create_all(url)
    # env.py drives its own asyncio.run(); must run off-thread since this
    # test itself is inside an already-running event loop, same reason
    # main.py's lifespan calls this via asyncio.to_thread too.
    await asyncio.to_thread(_run_migrations_bootstrap_sync, _BASE_DIR, url)

    conn = sqlite3.connect(path)
    try:
        stamp = conn.execute("SELECT version_num FROM alembic_version").fetchone()
        assert stamp[0] != _CREATE_ALL_BASELINE_REVISION, (
            "must not be stamped at the pre-FTS5 baseline - the FTS5 "
            "migration must actually have run"
        )

        search_index_sql = conn.execute(
            "SELECT sql FROM sqlite_master WHERE name='search_index'"
        ).fetchone()
        assert search_index_sql is not None, "search_index must exist"
        assert "VIRTUAL TABLE" in search_index_sql[0]

        memories_sql = conn.execute(
            "SELECT sql FROM sqlite_master WHERE name='project_memories'"
        ).fetchone()
        assert memories_sql is not None, "project_memories must exist"
        assert "VIRTUAL TABLE" in memories_sql[0]

        # And the tables are actually usable with real FTS5 MATCH queries.
        conn.execute(
            "INSERT INTO search_index (type, name, path) VALUES ('file', 'main.py', 'app/main.py')"
        )
        rows = conn.execute(
            "SELECT name FROM search_index WHERE search_index MATCH ?", ("main*",)
        ).fetchall()
        assert rows == [("main.py",)]
    finally:
        conn.close()


@pytest.mark.asyncio
async def test_legacy_database_upgrades_through_every_pending_migration(db_url):
    """A database stamped at an old pre-baseline head must apply every
    migration after it in sequence, not just get re-stamped."""
    url, path = db_url
    await _create_all(url)

    conn = sqlite3.connect(path)
    # Simulate the true legacy shape: no telemetry indexes yet (create_all
    # with the *current* code already adds them - drop to simulate a DB
    # from before that migration existed), plain (pre-FTS5) search tables.
    conn.execute("DROP INDEX ix_telemetry_pings_project_id_timestamp")
    conn.execute("DROP INDEX ix_telemetry_pings_timestamp")
    conn.execute(
        "CREATE TABLE search_index (id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "type VARCHAR, name VARCHAR, path VARCHAR, content VARCHAR, line INTEGER)"
    )
    conn.execute(
        "CREATE TABLE project_memories (id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "project_id VARCHAR, agent_name VARCHAR, context_type VARCHAR, memory_content VARCHAR)"
    )
    conn.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)")
    conn.execute("INSERT INTO alembic_version VALUES ('92fe62d1e407')")
    conn.commit()
    conn.close()

    await asyncio.to_thread(_run_migrations_bootstrap_sync, _BASE_DIR, url)

    conn = sqlite3.connect(path)
    try:
        idx = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='telemetry_pings'"
        ).fetchall()
        assert len(idx) == 2, "the telemetry_pings indexes must have been applied too"

        search_index_sql = conn.execute(
            "SELECT sql FROM sqlite_master WHERE name='search_index'"
        ).fetchone()
        assert "VIRTUAL TABLE" in search_index_sql[0]
    finally:
        conn.close()
