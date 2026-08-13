from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class FlowStateArgs(BaseModel):
    pass  # No arguments needed, it fetches the current project state


async def get_developer_flow_state(session: AsyncSession, project_id: UUID) -> dict:
    """
    Fetches the developer's current flow state based on the last 30 minutes of telemetry pings.
    Returns metrics like active time, idle ratio, and friction level.
    """
    result = await session.execute(
        text("""
            SELECT
                COALESCE(SUM(thinking_ms + coding_ms + testing_ms), 0) as total_activity_ms,
                COUNT(*) as ping_count,
                COUNT(CASE WHEN thinking_ms + coding_ms + testing_ms = 0 THEN 1 END) as idle_pings
            FROM telemetry_pings
            WHERE timestamp >= datetime('now', '-30 minutes')
            AND project_id = :pid
        """),
        {"pid": str(project_id)},
    )
    row = result.fetchone()

    if not row or row[1] == 0:
        return {"status": "No hay datos de telemetría recientes en los últimos 30 minutos."}

    total_ms = row[0] or 0
    ping_count = row[1] or 0
    idle_pings = row[2] or 0

    total_seconds = total_ms / 1000.0
    idle_ratio = (idle_pings / ping_count) * 100 if ping_count > 0 else 0

    friction_level = "low"
    if idle_ratio > 50 and total_seconds < 60:
        friction_level = "high"
    elif idle_ratio > 30:
        friction_level = "medium"

    return {
        "time_window_minutes": 30,
        "total_active_seconds": round(total_seconds, 2),
        "total_pings": ping_count,
        "idle_pings": idle_pings,
        "idle_ratio_percent": round(idle_ratio, 2),
        "estimated_friction_level": friction_level,
    }
