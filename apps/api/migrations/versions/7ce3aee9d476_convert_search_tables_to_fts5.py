"""convert_search_tables_to_fts5

Revision ID: 7ce3aee9d476
Revises: 5f7aa4b1b973
Create Date: 2026-09-04 19:05:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7ce3aee9d476"
down_revision: str | Sequence[str] | None = "5f7aa4b1b973"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Recreate search_index and project_memories as real FTS5 virtual tables.

    Both were plain SQL tables (from Base.metadata.create_all(), since
    SearchIndexModel/ProjectMemoryModel were ordinary declarative models),
    despite every query against project_memories already using FTS5's
    `MATCH` syntax and every docstring/comment in the codebase claiming
    "FTS5" - a leftover `init_fts5()` initializer was removed from
    database.py at some point and never replaced by an equivalent
    migration. `MATCH` against a plain table fails outright ("no such
    column: project_memories"), so project memory search and the AI
    agent's episodic-memory context injection have been silently broken
    (swallowed by a bare except-and-return-empty) ever since.

    This drops the plain tables and recreates them as FTS5 virtual
    tables - existing rows are lost. That's acceptable for search_index
    (rebuilt on every "Analyze" call) and, per explicit product decision,
    for project_memories too (this predates any real distributed install).
    """
    op.execute("DROP TABLE IF EXISTS search_index")
    op.execute(
        """
        CREATE VIRTUAL TABLE search_index USING fts5(
            type UNINDEXED,
            name,
            path,
            content,
            line UNINDEXED
        )
        """
    )

    op.execute("DROP TABLE IF EXISTS project_memories")
    op.execute(
        """
        CREATE VIRTUAL TABLE project_memories USING fts5(
            project_id UNINDEXED,
            agent_name UNINDEXED,
            context_type UNINDEXED,
            memory_content
        )
        """
    )


def downgrade() -> None:
    """Recreate both as plain tables, matching the previous ORM model shape."""
    op.execute("DROP TABLE IF EXISTS search_index")
    op.execute(
        """
        CREATE TABLE search_index (
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            type VARCHAR,
            name VARCHAR,
            path VARCHAR,
            content VARCHAR,
            line INTEGER
        )
        """
    )

    op.execute("DROP TABLE IF EXISTS project_memories")
    op.execute(
        """
        CREATE TABLE project_memories (
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            project_id VARCHAR,
            agent_name VARCHAR,
            context_type VARCHAR,
            memory_content VARCHAR
        )
        """
    )
