"""add_icebox_status_to_tickets

Revision ID: 9a1e4c8b2d11
Revises: 7b8e11a22c33
Create Date: 2026-08-15 15:15:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9a1e4c8b2d11"
down_revision: str | Sequence[str] | None = "7b8e11a22c33"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema to support icebox status in kanban tickets."""
    bind = op.get_bind()
    if bind.engine.name == "postgresql":
        # Add value to enum type in Postgres if applicable
        op.execute("ALTER TYPE ticketstatus ADD VALUE IF NOT EXISTS 'ICEBOX'")
    # For SQLite, VARCHAR columns accept any string value natively.


def downgrade() -> None:
    """Downgrade schema."""
    pass
