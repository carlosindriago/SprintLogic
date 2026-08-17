"""merge heads

Revision ID: c8ce1ffddd4d
Revises: 5e8b2ba0e267, 9a1e4c8b2d11
Create Date: 2026-08-16 20:47:23.596712

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = 'c8ce1ffddd4d'
down_revision: str | Sequence[str] | None = ('5e8b2ba0e267', '9a1e4c8b2d11')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
