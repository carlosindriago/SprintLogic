"""add_missing_columns

Revision ID: 3473b1a887cc
Revises: 69976f5b0dbd
Create Date: 2026-08-07 18:54:02.011667

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '3473b1a887cc'
down_revision: str | Sequence[str] | None = '69976f5b0dbd'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


from sqlalchemy.engine import Inspector


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)

    # analysis_reports.type
    analysis_reports_cols = [c["name"] for c in inspector.get_columns("analysis_reports")]
    if "type" not in analysis_reports_cols:
        with op.batch_alter_table("analysis_reports") as batch_op:
            batch_op.add_column(
                sa.Column("type", sa.String(50), server_default="code_analysis")
            )

    # tool_model_mappings.fallback_models
    tool_model_mappings_cols = [c["name"] for c in inspector.get_columns("tool_model_mappings")]
    if "fallback_models" not in tool_model_mappings_cols:
        with op.batch_alter_table("tool_model_mappings") as batch_op:
            batch_op.add_column(sa.Column("fallback_models", sa.JSON(), nullable=True))

    # projects columns
    projects_cols = [c["name"] for c in inspector.get_columns("projects")]
    with op.batch_alter_table("projects") as batch_op:
        if "cached_schema" not in projects_cols:
            batch_op.add_column(sa.Column("cached_schema", sa.JSON(), nullable=True))
        if "schema_hash" not in projects_cols:
            batch_op.add_column(sa.Column("schema_hash", sa.String(255), nullable=True))
        if "schema_updated_at" not in projects_cols:
            batch_op.add_column(sa.Column("schema_updated_at", sa.DateTime(), nullable=True))

def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)

    # analysis_reports.type
    analysis_reports_cols = [c["name"] for c in inspector.get_columns("analysis_reports")]
    if "type" in analysis_reports_cols:
        with op.batch_alter_table("analysis_reports") as batch_op:
            batch_op.drop_column("type")

    # tool_model_mappings.fallback_models
    tool_model_mappings_cols = [c["name"] for c in inspector.get_columns("tool_model_mappings")]
    if "fallback_models" in tool_model_mappings_cols:
        with op.batch_alter_table("tool_model_mappings") as batch_op:
            batch_op.drop_column("fallback_models")

    # projects columns
    projects_cols = [c["name"] for c in inspector.get_columns("projects")]
    with op.batch_alter_table("projects") as batch_op:
        if "cached_schema" in projects_cols:
            batch_op.drop_column("cached_schema")
        if "schema_hash" in projects_cols:
            batch_op.drop_column("schema_hash")
        if "schema_updated_at" in projects_cols:
            batch_op.drop_column("schema_updated_at")
