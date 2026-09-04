"""add_index_to_telemetry_pings

Revision ID: 5f7aa4b1b973
Revises: 92fe62d1e407
Create Date: 2026-09-04 18:17:42.204623

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5f7aa4b1b973"
down_revision: str | Sequence[str] | None = "92fe62d1e407"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Index telemetry_pings on (project_id, timestamp) and timestamp alone.

    Every insights-dashboard query filters on timestamp, and on project_id
    too when a single project is selected (see
    interfaces/api/v1/projects/insights.py). Without these, every read is a
    full scan of a table a background telemetry daemon inserts into
    continuously and that never shrinks.
    """
    op.create_index(
        "ix_telemetry_pings_project_id_timestamp",
        "telemetry_pings",
        ["project_id", "timestamp"],
    )
    op.create_index("ix_telemetry_pings_timestamp", "telemetry_pings", ["timestamp"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_telemetry_pings_timestamp", table_name="telemetry_pings")
    op.drop_index("ix_telemetry_pings_project_id_timestamp", table_name="telemetry_pings")
