"""add_test_status_to_kanban_tickets

Revision ID: 92fe62d1e407
Revises: 6e2442813928
Create Date: 2026-08-20 13:10:00.233753

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "92fe62d1e407"
down_revision: str | Sequence[str] | None = "6e2442813928"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema to support test status in kanban tickets."""
    bind = op.get_bind()
    if bind.engine.name == "postgresql":
        op.execute("ALTER TYPE ticketstatus ADD VALUE IF NOT EXISTS 'TEST'")
        op.execute("ALTER TYPE ticketstatus ADD VALUE IF NOT EXISTS 'test'")


def downgrade() -> None:
    """Downgrade schema."""
    pass
