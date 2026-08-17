"""add_model_health_metrics

Revision ID: 7b8e11a22c33
Revises: 69976f5b0dbd
Create Date: 2026-08-14 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7b8e11a22c33"
down_revision: str | Sequence[str] | None = "69976f5b0dbd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "model_health_metrics",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("model_id", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(100), nullable=False),
        sa.Column("total_calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("success_calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("timeout_calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_latency_ms", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("avg_latency_ms", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("last_latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_status", sa.String(50), nullable=False, server_default="untested"),
        sa.Column("last_called_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("model_id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("model_health_metrics")
