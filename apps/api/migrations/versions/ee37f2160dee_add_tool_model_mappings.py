"""add_tool_model_mappings

Revision ID: ee37f2160dee
Revises: c2c76f51dc59
Create Date: 2026-07-27 11:43:21.666400

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ee37f2160dee'
down_revision: Union[str, Sequence[str], None] = 'c2c76f51dc59'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "tool_model_mappings",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("tool_name", sa.String(255), nullable=False),
        sa.Column("provider_id", sa.String(255), nullable=False),
        sa.Column("model_name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tool_name"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("tool_model_mappings")
