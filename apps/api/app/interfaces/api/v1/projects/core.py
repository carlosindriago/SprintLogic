import asyncio
import logging
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.application.scan_repo import ScanCodebaseUseCase, ScanLocalRepository
from app.domain.exceptions import PathBlockedError, ScannerError
from app.infrastructure.db.database import get_db_session, get_sessionmaker
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.events.active_scans import active_scans
from app.infrastructure.events.event_bus import global_event_bus
from app.infrastructure.git.git_gateway import LocalGitGateway
from app.infrastructure.parser.ast_parser import ASTParserService
from app.infrastructure.providers.local_fs import LocalFileSystemProvider
from app.infrastructure.repositories.graph_repository import SQLAlchemyGraphRepository
from app.interfaces.api.v1.project_schemas import (
    ProjectDeletedResponse,
    ProjectListResponse,
    ProjectResponse,
    ScanProjectRequest,
    ScanStartedResponse,
)
from app.interfaces.api.v1.project_schemas import (
    UpdateProjectRequest as UpdateProjectRequestDTO,
)

from .graph import graph_cache

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Projects - Core"])
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


@router.get("/projects", response_model=ProjectListResponse)
async def get_projects(session: AsyncSession = Depends(get_db_session)) -> ProjectListResponse:
    repo = SQLAlchemyProjectRepository(session)
    projects = await repo.get_all()
    return ProjectListResponse(
        projects=[ProjectResponse.model_validate(p, from_attributes=True) for p in projects]
    )


@router.post("/projects/scan", status_code=202, response_model=ScanStartedResponse)
async def scan_project(
    request: ScanProjectRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session),
) -> ScanStartedResponse:
    git_gateway = LocalGitGateway()
    project_repo = SQLAlchemyProjectRepository(session)

    from app.domain.path_validator import PathSecurityValidator

    canonical = PathSecurityValidator.validate_project_path(request.path)
    existing_project = await project_repo.get_by_path(str(canonical))
    if existing_project is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe un proyecto con el directorio '{canonical.name}' en la lista.",
        )

    scan_repo_usecase = ScanLocalRepository(git_gateway, project_repo)

    try:
        saved_project = await scan_repo_usecase.execute(request.path)
        await session.commit()
    except PathBlockedError as e:
        logger.error("Project operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=403, detail="Access denied")
    except ScannerError as e:
        logger.error("Project operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=422, detail="Unprocessable Entity")
    except ValueError as e:
        logger.error("Project operation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail="Bad Request")

    parser = ASTParserService()
    graph_repo = SQLAlchemyGraphRepository(session)
    provider = LocalFileSystemProvider(saved_project.path)

    scan_codebase_usecase = ScanCodebaseUseCase(provider, parser, global_event_bus, graph_repo)

    cancel_token = asyncio.Event()
    active_scans[str(saved_project.id)] = cancel_token

    background_tasks.add_task(
        scan_codebase_usecase.execute, saved_project.id, cancel_token, saved_project.path
    )

    return ScanStartedResponse(
        status="scanning started",
        project_id=saved_project.id,
        message="The AST parsing is running in the background.",
    )


@router.get("/projects/{project_id}/scan/stream")
async def stream_scan_progress(project_id: str):
    async def event_generator():
        try:
            topic = f"scan:{project_id}"
            async for event in global_event_bus.event_generator(topic):
                yield {"data": event}
                if event.get("type") in ("completed", "failed", "error"):
                    break
        except asyncio.CancelledError:
            logger.warning("TCP client disconnected abruptly for project %s", project_id)
            raise

    return EventSourceResponse(event_generator())


async def _run_background_scan(project_uuid: UUID, project_path: str, cancel_token: asyncio.Event):
    try:
        async_session = get_sessionmaker()
        async with async_session() as bg_session:
            parser = ASTParserService()
            graph_repo = SQLAlchemyGraphRepository(bg_session)
            provider = LocalFileSystemProvider(project_path)
            usecase = ScanCodebaseUseCase(provider, parser, global_event_bus, graph_repo)
            try:
                await usecase.execute(project_uuid, cancel_token, project_path)
            except Exception as e:
                logger.error(f"Background scan failed for {project_uuid}: {e}", exc_info=True)
                await global_event_bus.publish(
                    f"scan:{project_uuid}", {"type": "failed", "error": str(e)}
                )
    finally:
        active_scans.pop(str(project_uuid), None)


@router.post("/projects/{project_id}/rescan", status_code=202)
async def rescan_project(
    project_id: str,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project_id in active_scans:
        # Cancel the existing scan
        old_token = active_scans.pop(project_id)
        old_token.set()
        await asyncio.sleep(0.5)  # Give it a moment to gracefully shutdown

    graph_repo = SQLAlchemyGraphRepository(session)
    await graph_repo.clear_by_project(project_uuid)

    keys_to_del = [k for k in graph_cache if k.startswith(str(project_uuid))]
    for k in keys_to_del:
        del graph_cache[k]

    cancel_token = asyncio.Event()
    active_scans[str(project_uuid)] = cancel_token

    # Limpiar estado previo para que SSE no lea un "completed" del escaneo anterior
    global_event_bus.clear_latest(f"scan:{project_uuid}")

    background_tasks.add_task(_run_background_scan, project_uuid, project.path, cancel_token)

    return {
        "status": "rescanning started",
        "project_id": str(project_uuid),
        "message": "AST parsing is running in the background with fresh git birth dates.",
    }


@router.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    request: UpdateProjectRequestDTO,
    session: AsyncSession = Depends(get_db_session),
) -> ProjectResponse:
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.update(project_uuid, name=request.name, path=request.path)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await session.commit()

    return ProjectResponse.model_validate(project, from_attributes=True)


@router.delete("/projects/{project_id}", response_model=ProjectDeletedResponse)
async def delete_project(
    project_id: str, session: AsyncSession = Depends(get_db_session)
) -> ProjectDeletedResponse:
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    success = await repo.delete(project_uuid)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")

    await session.commit()
    return ProjectDeletedResponse(status="success")
