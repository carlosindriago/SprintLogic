import asyncio
import json
import logging
from typing import Any
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.infrastructure.db.database import get_db_session, get_sessionmaker
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.events.event_bus import global_event_bus

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Projects - Ws"])
project_event_queues: dict[str, list[asyncio.Queue[dict[str, Any]]]] = {}

IGNORE_DIRS = {
    "node_modules",
    ".git",
    ".next",
    "dist",
    "__pycache__",
    ".venv",
    "target",
    "build",
    ".turbo",
    "coverage",
}
SOURCE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".php"}
MAX_FILE_BYTES = 500_000
import contextlib

from watchfiles import Change

from app.infrastructure.file_watcher import file_watcher


async def file_watcher_callback(project_id: str, change: Change, filepath: str):
    if project_id in project_event_queues:
        event = {"type": "file_change", "change": change.name, "filepath": filepath}
        # If tasks.md changed, send a specific kanban_update event
        if filepath.endswith("tasks.md"):
            event["type"] = "kanban_update"

        for q in project_event_queues[project_id]:
            await q.put(event)


@router.get("/projects/{project_id}/events")
async def project_events(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Start watcher for this project
    await file_watcher.start_watching(project_id, project.path)

    q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    if project_id not in project_event_queues:
        project_event_queues[project_id] = []
    project_event_queues[project_id].append(q)

    async def event_generator():
        try:
            while True:
                event = await q.get()
                import json

                yield {"data": json.dumps(event)}
        except asyncio.CancelledError:
            project_event_queues[project_id].remove(q)
            if not project_event_queues[project_id]:
                del project_event_queues[project_id]
                await file_watcher.stop_watching(project_id)

    return EventSourceResponse(event_generator())


@router.get("/projects/{project_id}/session/stream")
async def session_stream(
    project_id: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
):
    """
    SSE persistente para la sesión del IDE. Mantiene la conexión abierta durante
    toda la sesión de trabajo. El TelemetryDaemon publica insights proactivos
    por este canal cuando detecta anomalías en los patrones de productividad.
    """
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    daemon = request.app.state.telemetry_daemon
    await daemon.start_monitoring(project_id)

    topic = f"session:{project_id}"

    async def event_generator():
        try:
            async for event in global_event_bus.persistent_event_generator(topic):
                yield {"data": json.dumps(event)}
        except asyncio.CancelledError:
            if global_event_bus.subscriber_count(topic) == 0:
                await daemon.stop_monitoring(project_id)

    return EventSourceResponse(event_generator())


@router.websocket("/projects/{project_id}/ws")
async def project_ws(websocket: WebSocket, project_id: str):
    await websocket.accept()

    try:
        project_uuid = UUID(project_id)
    except ValueError:
        await websocket.close(code=1008, reason="Invalid project ID")
        return

    async with get_sessionmaker()() as session:
        repo = SQLAlchemyProjectRepository(session)
        project = await repo.get_project(project_uuid)

    if not project:
        await websocket.close(code=1008, reason="Project not found")
        return

    await file_watcher.start_watching(project_id, project.path)

    q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    if project_id not in project_event_queues:
        project_event_queues[project_id] = []
    project_event_queues[project_id].append(q)

    pending_paths: set[str] = set()
    pending_lock = asyncio.Lock()

    async def flush():
        async with pending_lock:
            if not pending_paths:
                return
            paths = sorted(pending_paths)
            pending_paths.clear()
            try:
                await websocket.send_json({"type": "file_changed", "paths": paths})
            except Exception:
                logger.warning("Unhandled exception", exc_info=True)

    async def debounce_loop():
        try:
            while True:
                await asyncio.sleep(0.5)
                await flush()
        except asyncio.CancelledError:
            await flush()

    async def queue_consumer():
        try:
            while True:
                event = await q.get()
                async with pending_lock:
                    pending_paths.add(event["filepath"])
        except asyncio.CancelledError:
            pass

    debounce_task = asyncio.create_task(debounce_loop())
    consumer_task = asyncio.create_task(queue_consumer())

    try:
        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    finally:
        debounce_task.cancel()
        consumer_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await debounce_task
        with contextlib.suppress(asyncio.CancelledError):
            await consumer_task

        if project_id in project_event_queues:
            if q in project_event_queues[project_id]:
                project_event_queues[project_id].remove(q)
            if not project_event_queues[project_id]:
                del project_event_queues[project_id]
                await file_watcher.stop_watching(project_id)
