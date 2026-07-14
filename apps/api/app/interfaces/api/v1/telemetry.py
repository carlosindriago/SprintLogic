from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db_session

router = APIRouter(tags=["telemetry"])

class TelemetryPayload(BaseModel):
    window_start: int
    window_end: int
    thinking_ms: int
    coding_ms: int
    testing_ms: int
    project_id: str | None = None

@router.post("/session", status_code=status.HTTP_201_CREATED)
async def ingest_telemetry_ping(
    payload: TelemetryPayload,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Ingests a telemetry ping from the IDE containing absolute window times
    and the accumulated time buckets. Optionally scoped to a project.
    """
    await session.execute(
        text(
            """
            INSERT INTO telemetry_pings (
                project_id,
                window_start_ms,
                window_end_ms,
                thinking_ms,
                coding_ms,
                testing_ms
            ) VALUES (
                :project_id,
                :window_start,
                :window_end,
                :thinking_ms,
                :coding_ms,
                :testing_ms
            )
            """
        ),
        {
            "project_id": payload.project_id,
            "window_start": payload.window_start,
            "window_end": payload.window_end,
            "thinking_ms": payload.thinking_ms,
            "coding_ms": payload.coding_ms,
            "testing_ms": payload.testing_ms,
        }
    )
    await session.commit()
    return {"status": "success"}
