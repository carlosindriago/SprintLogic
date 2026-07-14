"""add_ast_cas_models

Revision ID: a9456940b7d5
Revises: e785b38accca
Create Date: 2026-07-13 14:22:46.281679

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a9456940b7d5'
down_revision: str | Sequence[str] | None = 'e785b38accca'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "ast_node_map",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("file_path", sa.String(length=1024), nullable=False),
        sa.Column("fqn", sa.String(length=1024), nullable=False),
        sa.Column("node_hash", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ast_node_map_project_id"), "ast_node_map", ["project_id"], unique=False)
    op.create_index(op.f("ix_ast_node_map_fqn"), "ast_node_map", ["fqn"], unique=False)
    op.create_index(op.f("ix_ast_node_map_node_hash"), "ast_node_map", ["node_hash"], unique=False)

    op.create_table(
        "ast_vectors",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("node_hash", sa.String(length=64), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ast_vectors_node_hash"), "ast_vectors", ["node_hash"], unique=True)

    op.execute("CREATE VIRTUAL TABLE IF NOT EXISTS vec_ast_nodes USING vec0(embedding float[384])")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP TABLE IF EXISTS vec_ast_nodes")
    op.drop_index(op.f("ix_ast_vectors_node_hash"), table_name="ast_vectors")
    op.drop_table("ast_vectors")
    op.drop_index(op.f("ix_ast_node_map_node_hash"), table_name="ast_node_map")
    op.drop_index(op.f("ix_ast_node_map_fqn"), table_name="ast_node_map")
    op.drop_index(op.f("ix_ast_node_map_project_id"), table_name="ast_node_map")
    op.drop_table("ast_node_map")
