# ruff: noqa: E402, E501
import asyncio
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any
from uuid import UUID

import litellm
import networkx as nx
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel
from sqlalchemy import text
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
from app.infrastructure.repositories.tool_model_repository import (
    resolve_tool_model,
    tool_model_label,
)
from app.infrastructure.security.credential_manager import CredentialManager
from app.infrastructure.security.rate_limiter import require_rate_limit
from app.interfaces.api.v1.project_schemas import (
    AnalyzeGraphRequest,
    ProjectDeletedResponse,
    ProjectListResponse,
    ProjectResponse,
    ScanProjectRequest,
    ScanStartedResponse,
)
from app.interfaces.api.v1.project_schemas import (
    UpdateProjectRequest as UpdateProjectRequestDTO,
)
from app.interfaces.api.v1.wbs_schemas import WBSHierarchicalResponse
from app.utils.async_io import (
    async_copy2,
    async_exists,
    async_is_file,
    async_mkdir_parents,
    async_read_bytes,
    async_read_text,
    async_remove,
    async_rename,
    async_write_text,
)
from app.utils.security import resolve_project_path

logger = logging.getLogger(__name__)

router = APIRouter()

graph_cache: dict[UUID, tuple[dict, float]] = {}


# ── Request models not yet moved to project_schemas ───────────────────────────
# (file/editor-specific schemas; keep here until they get their own module)


class FileContentUpdate(BaseModel):
    content: str
    base_hash: str | None = None


class RenameRequest(BaseModel):
    path: str
    new_name: str


class FileOperationRequest(BaseModel):
    path: str


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

    background_tasks.add_task(scan_codebase_usecase.execute, saved_project.id, cancel_token, saved_project.path)

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
                if event.get("type") == "completed":
                    break
        except asyncio.CancelledError:
            logger.warning("TCP client disconnected abruptly for project %s", project_id)
            raise
        finally:
            active_scans.pop(project_id, None)

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
                await global_event_bus.publish(f"scan:{project_uuid}", {"type": "failed", "error": str(e)})
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

    graph_repo = SQLAlchemyGraphRepository(session)
    await graph_repo.clear_by_project(project_uuid)

    if project_uuid in graph_cache:
        del graph_cache[project_uuid]

    if project_id in active_scans:
        return {"message": "Project is already being scanned."}

    cancel_token = asyncio.Event()
    active_scans[str(project_uuid)] = cancel_token

    # Limpiar estado previo para que SSE no lea un "completed" del escaneo anterior
    global_event_bus.clear_latest(f"scan:{project_uuid}")

    background_tasks.add_task(
        _run_background_scan, project_uuid, project.path, cancel_token
    )

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


@router.get("/projects/{project_id}/graph")
async def get_project_graph(project_id: str, expanded_folders: str | None = None, session: AsyncSession = Depends(get_db_session)):
    # Update last opened time since we are fetching the graph
    try:
        project_uuid = UUID(project_id)
        repo = SQLAlchemyProjectRepository(session)
        project = await repo.get_project(project_uuid)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        try:
            await repo.update_last_opened(project_uuid)
            await session.commit()
        except Exception as e:
            logger.warning("Unhandled exception: %s", e, exc_info=True)
            if "database is locked" in str(e):
                await session.rollback()
            else:
                raise
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    cache_key = f"{project_uuid}_{expanded_folders or ''}"
    cached = graph_cache.get(cache_key)
    if cached and (time.time() - cached[1]) < 300:
        return cached[0]

    graph_repo = SQLAlchemyGraphRepository(session)
    nodes = await graph_repo.get_nodes_by_project(project_uuid)
    edges = await graph_repo.get_edges_by_project(project_uuid)

    project_path = os.path.abspath(project.path)

    # Filter nodes by project path to ensure we don't mix projects
    filtered_nodes = [n for n in nodes if os.path.abspath(n.file_path).startswith(project_path)]
    valid_node_ids = {n.id for n in filtered_nodes}

    # Filter edges to only include those between valid nodes
    filtered_edges = [
        e for e in edges if e.source_id in valid_node_ids and e.target_id in valid_node_ids
    ]

    # Calculate degrees
    in_degree = {n_id: 0 for n_id in valid_node_ids}
    out_degree = {n_id: 0 for n_id in valid_node_ids}
    adj: dict[str, list[str]] = {n_id: [] for n_id in valid_node_ids}

    for edge in filtered_edges:
        in_degree[edge.target_id] += 1
        out_degree[edge.source_id] += 1
        adj[edge.source_id].append(edge.target_id)

    # NetworkX SCC — O(V+E) linear time, extracted to thread
    def _compute_scc(edges) -> dict[str, int]:
        G_local: nx.DiGraph[str] = nx.DiGraph()
        for e in edges:
            G_local.add_edge(e.source_id, e.target_id)

        mapping: dict[str, int] = {}
        for i, scc in enumerate(nx.strongly_connected_components(G_local)):
            if len(scc) > 1:
                for v in scc:
                    mapping[v] = i
        return mapping

    node_to_scc = await asyncio.to_thread(_compute_scc, filtered_edges)


    nodes_dict = []
    for n in filtered_nodes:
        label_val = n.label.value if hasattr(n.label, "value") else n.label

        try:
            rel_path = os.path.relpath(n.file_path, project_path)
            folder = os.path.dirname(rel_path) or "/"
        except Exception:
            logger.warning("Unhandled exception", exc_info=True)
            folder = "/"

        node_dict = {
            "id": n.id,
            "label": label_val,
            "name": n.name,
            "file_path": n.file_path,
            "folder": folder,
            "domain_group": _assign_domain_group(n.file_path),
            "in_degree": in_degree.get(n.id, 0),
            "out_degree": out_degree.get(n.id, 0),
        }
        if label_val == "File":
            node_dict["size"] = n.file_size or 1000
            node_dict["loc"] = n.loc or 0
            try:
                meta = json.loads(n.meta_data or "{}")
                if "birth_time" in meta:
                    node_dict["birth_time"] = meta["birth_time"]
            except (json.JSONDecodeError, TypeError):
                pass
        nodes_dict.append(node_dict)

    links_dict = []
    for edge in filtered_edges:
        is_cycle = False
        if edge.source_id in node_to_scc and edge.target_id in node_to_scc:
            if node_to_scc[edge.source_id] == node_to_scc[edge.target_id]:
                is_cycle = True

        links_dict.append(
            {
                "source": edge.source_id,
                "target": edge.target_id,
                "type": edge.type.value if hasattr(edge.type, "value") else edge.type,
                "is_cycle": is_cycle,
            }
        )

    if expanded_folders == "ALL_FILES":
        collapsed = {"nodes": nodes_dict, "links": links_dict}
    else:
        # Apply Macro-to-Micro density collapse
        from app.application.graph_collapse import collapse_graph_by_density
        expanded_set = set(expanded_folders.split(",")) if expanded_folders else set()
        collapsed = collapse_graph_by_density(nodes_dict, links_dict, max_density=15, expanded_folders=expanded_set)

    collapsed["framework"] = _detect_project_framework(project.path)

    graph_cache[cache_key] = (collapsed, time.time())

    return collapsed


from concurrent.futures import ProcessPoolExecutor


def _detect_project_framework(project_path: str) -> str:
    path = Path(project_path)
    pkg_json = path / "package.json"
    if pkg_json.exists():
        try:
            content = pkg_json.read_text(encoding="utf-8")
            if '"next"' in content:
                return "Next.js"
            if '"laravel-vite-plugin"' in content:
                return "Laravel (Hybrid)"
            if '"react"' in content:
                return "React"
            if '"vue"' in content:
                return "Vue.js"
            if '"express"' in content:
                return "Express"
            if '"@nestjs/core"' in content:
                return "NestJS"
        except Exception:
            pass

    composer = path / "composer.json"
    if composer.exists():
        try:
            content = composer.read_text(encoding="utf-8")
            if "laravel/framework" in content:
                return "Laravel"
            if "symfony/framework-bundle" in content:
                return "Symfony"
        except Exception:
            pass

    for py_file in ["pyproject.toml", "requirements.txt", "Pipfile"]:
        f = path / py_file
        if f.exists():
            try:
                content = f.read_text(encoding="utf-8")
                if "fastapi" in content.lower():
                    return "FastAPI"
                if "django" in content.lower():
                    return "Django"
                if "flask" in content.lower():
                    return "Flask"
            except Exception:
                pass

    if (path / "Cargo.toml").exists():
        return "Rust"
    if (path / "go.mod").exists():
        return "Go"
    if (path / "pom.xml").exists() or (path / "build.gradle").exists():
        return "Spring Boot"

    return "TypeScript / JavaScript"


def _assign_domain_group(file_path: str) -> str:
    path_lower = file_path.lower()
    if any(k in path_lower for k in [".spec.", ".test.", "tests/", "test/"]):
        return "test"
    if any(k in path_lower for k in ["controller", "routes/", "views.py", "router", "api/"]):
        return "backend_controller"
    if any(k in path_lower for k in ["model", "entity", "schemas", "schema.py", "entities"]):
        return "database_model"
    if any(k in path_lower for k in ["components/", "views/", "resources/js/", "pages/", "src/app/", "ui/"]):
        return "frontend"
    if any(k in path_lower for k in ["service", "usecase", "repository", "application/", "domain/"]):
        return "domain_service"
    if any(k in path_lower for k in ["config", "util", "helper", "lib/"]):
        return "utility"
    return "other"


@router.get("/projects/{project_id}/nodes/{node_id:path}/insight")
async def get_node_insight(
    project_id: str,
    node_id: str,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        proj_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(proj_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await session.execute(
        select(GraphNodeModel).where(
            GraphNodeModel.project_id == proj_uuid,
            (GraphNodeModel.id == node_id) | (GraphNodeModel.file_path == node_id),
        )
    )
    node = result.scalars().first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found in graph")

    meta_dict: dict[str, Any] = {}
    if node.meta_data:
        try:
            meta_dict = json.loads(node.meta_data)
        except (json.JSONDecodeError, TypeError):
            meta_dict = {}

    if meta_dict.get("ai_summary"):
        return {"ai_summary": meta_dict["ai_summary"], "cached": True}

    file_content = ""
    try:
        full_path = resolve_project_path(project.path, node.file_path)
        with open(full_path, encoding="utf-8") as f:
            file_content = f.read()
    except Exception:
        file_content = f"// Archivo: {node.file_path} (Contenido no disponible)"

    provider_id, model_name, _ = await resolve_tool_model(session, "graph_node_insight")
    actual_model = tool_model_label(provider_id, model_name)
    api_key = CredentialManager.get_api_key(f"sprintlogic_{provider_id}") or CredentialManager.get_api_key(provider_id)
    if not api_key:
        api_key = CredentialManager.get_api_key("sprintlogic_openrouter")
        if not api_key:
            raise HTTPException(status_code=400, detail=f"API key for {provider_id} not configured")

    from app.infrastructure.repositories.prompt_repository import get_prompt_async
    prompt_record = await get_prompt_async(session, "graph_node_insight")
    system_prompt = prompt_record.content if prompt_record else "Eres un arquitecto de software experto. Analiza este código y genera un resumen técnico directo de máximo 3 líneas sobre su responsabilidad principal en el sistema. No uses saludos."

    user_msg = f"Archivo: {node.file_path}\nNombre: {node.name}\n\nCódigo fuente:\n```\n{file_content[:6000]}\n```"

    try:
        response = await litellm.acompletion(
            model=actual_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            api_key=api_key,
        )
        ai_summary = response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Failed to generate node insight: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error al generar el resumen del nodo con IA")

    meta_dict["ai_summary"] = ai_summary
    node.meta_data = json.dumps(meta_dict)
    await session.commit()

    return {"ai_summary": ai_summary, "cached": False}


def get_process_pool(request: Request) -> ProcessPoolExecutor:
    return request.app.state.process_pool

from fastapi.responses import PlainTextResponse, StreamingResponse

from app.application.analyze_project_graph import AnalyzeProjectGraphUseCase


@router.post("/projects/{project_id}/graph/analyze")
async def analyze_project_graph(
    req: Request,
    project_id: str,
    request: AnalyzeGraphRequest,
    session: AsyncSession = Depends(get_db_session),
    _rate_limit: None = Depends(require_rate_limit(limit=10, window_seconds=60, scope="graph_analyze")),
):
    try:
        project_uuid = UUID(project_id)
        repo = SQLAlchemyProjectRepository(session)
        project = await repo.get_project(project_uuid)

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        lang_code = req.headers.get("Accept-Language", "en").split("-")[0]
        use_case = AnalyzeProjectGraphUseCase(session, project, lang_code=lang_code)

        return StreamingResponse(use_case.execute(), media_type="text/event-stream")

    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    except Exception as e:
        logger.error("Analysis failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")


@router.get("/projects/{project_id}/reports")
async def get_project_reports(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    from sqlalchemy import select

    from app.infrastructure.db.models import AnalysisReportModel
    from app.interfaces.api.v1.report_schemas import (
        AnalysisReportListResponse,
        AnalysisReportResponse,
    )

    result = await session.execute(
        select(AnalysisReportModel)
        .where(AnalysisReportModel.project_id == project_uuid, AnalysisReportModel.is_deleted.is_(False))
        .order_by(AnalysisReportModel.created_at.desc())
    )
    reports = result.scalars().all()

    return AnalysisReportListResponse(
        reports=[AnalysisReportResponse.model_validate(r, from_attributes=True) for r in reports]
    )


@router.get("/projects/{project_id}/reports/trash")
async def get_project_reports_trash(
    project_id: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    from sqlalchemy import select

    from app.infrastructure.db.models import AnalysisReportModel
    from app.interfaces.api.v1.report_schemas import (
        AnalysisReportListResponse,
        AnalysisReportResponse,
    )

    result = await session.execute(
        select(AnalysisReportModel)
        .where(AnalysisReportModel.project_id == project_uuid, AnalysisReportModel.is_deleted.is_(True))
        .order_by(AnalysisReportModel.created_at.desc())
    )
    reports = result.scalars().all()

    return AnalysisReportListResponse(
        reports=[AnalysisReportResponse.model_validate(r, from_attributes=True) for r in reports]
    )


@router.get("/projects/{project_id}/reports/{report_id}")
async def get_project_report(
    project_id: str, report_id: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
        report_uuid = UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    from sqlalchemy import select

    from app.infrastructure.db.models import AnalysisReportModel
    from app.interfaces.api.v1.report_schemas import AnalysisReportResponse

    result = await session.execute(
        select(AnalysisReportModel).where(
            AnalysisReportModel.id == report_uuid, AnalysisReportModel.project_id == project_uuid
        )
    )
    report = result.scalar_one_or_none()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return AnalysisReportResponse.model_validate(report, from_attributes=True)


@router.put("/projects/{project_id}/reports/{report_id}/trash")
async def trash_project_report(
    project_id: str, report_id: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
        report_uuid = UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    from sqlalchemy import select

    from app.infrastructure.db.models import AnalysisReportModel

    result = await session.execute(
        select(AnalysisReportModel).where(
            AnalysisReportModel.id == report_uuid, AnalysisReportModel.project_id == project_uuid
        )
    )
    report = result.scalar_one_or_none()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report.is_deleted = True
    await session.commit()
    return {"status": "success", "message": "Report moved to trash"}


@router.put("/projects/{project_id}/reports/{report_id}/restore")
async def restore_project_report(
    project_id: str, report_id: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
        report_uuid = UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    from sqlalchemy import select

    from app.infrastructure.db.models import AnalysisReportModel

    result = await session.execute(
        select(AnalysisReportModel).where(
            AnalysisReportModel.id == report_uuid, AnalysisReportModel.project_id == project_uuid
        )
    )
    report = result.scalar_one_or_none()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report.is_deleted = False
    await session.commit()
    return {"status": "success", "message": "Report restored"}


@router.delete("/projects/{project_id}/reports/{report_id}")
async def delete_project_report(
    project_id: str, report_id: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
        report_uuid = UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    from sqlalchemy import delete

    from app.infrastructure.db.models import AnalysisReportModel

    result = await session.execute(
        delete(AnalysisReportModel).where(
            AnalysisReportModel.id == report_uuid, AnalysisReportModel.project_id == project_uuid
        )
    )
    if result.rowcount == 0:  # type: ignore[attr-defined]
        raise HTTPException(status_code=404, detail="Report not found")

    await session.commit()
    return {"status": "success", "message": "Report permanently deleted"}


from sqlalchemy import select

from app.domain.graph_schemas import BlastRadiusItem, BlastRadiusResponse
from app.infrastructure.db.models import GraphNodeModel, ProjectModel


@router.get(
    "/projects/{project_id}/blast-radius",
    response_model=BlastRadiusResponse,
    summary="Calcular el Radio de Impacto (Blast Radius / Graph RAG) para un nodo o archivo",
)
async def get_project_blast_radius(
    project_id: str,
    node_id: str = Query(..., description="ID del nodo o ruta del archivo objetivo"),
    max_depth: int = Query(default=3, ge=1, le=5, description="Nivel máximo de profundidad (1-5)"),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        proj_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    project_result = await session.execute(select(ProjectModel).where(ProjectModel.id == proj_uuid))
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    target_id = node_id
    target_file_path = node_id

    # Resolution helper: Prefix file: if not prefixed
    if not target_id.startswith("file:") and not target_id.startswith("class:") and not target_id.startswith("func:"):
        target_id = f"file:{node_id}"

    node_result = await session.execute(
        select(GraphNodeModel).where(
            GraphNodeModel.project_id == proj_uuid,
            (GraphNodeModel.id == target_id) | (GraphNodeModel.file_path == node_id) | (GraphNodeModel.name == node_id)
        )
    )
    target_node = node_result.scalars().first()

    if target_node:
        target_id = target_node.id
        target_file_path = target_node.file_path or target_node.name

    repo = SQLAlchemyGraphRepository(session)
    raw_items = await repo.get_blast_radius(proj_uuid, target_id, max_depth)

    items: list[BlastRadiusItem] = [
        BlastRadiusItem(
            source_id=row["source_id"],
            target_id=row["target_id"],
            source_file_path=row["source_file_path"],
            edge_type=row["edge_type"],
            depth=row["depth"],
        )
        for row in raw_items
    ]

    grouped: dict[int, list[BlastRadiusItem]] = {}
    for item in items:
        grouped.setdefault(item.depth, []).append(item)

    return BlastRadiusResponse(
        project_id=proj_uuid,
        target_node_id=target_id,
        target_file_path=target_file_path,
        max_depth=max_depth,
        total_affected_files=len(items),
        items=items,
        grouped_by_depth=grouped,
    )


@router.get("/projects/{project_id}/nodes/{node_id:path}")
async def get_node_details(
    project_id: str, node_id: str, session: AsyncSession = Depends(get_db_session)
):
    # Check if project exists
    try:
        proj_uuid = UUID(project_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    project_result = await session.execute(select(ProjectModel).where(ProjectModel.id == proj_uuid))
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    node_result = await session.execute(select(GraphNodeModel).where(GraphNodeModel.id == node_id))
    node = node_result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    return {
        "id": node.id,
        "label": node.label,
        "name": node.name,
        "file_path": node.file_path,
        "metadata": node.meta_data,
    }


@router.get("/projects/{project_id}/files")
async def get_project_files(
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

    def build_tree(path):
        name = os.path.basename(path)
        is_dir = os.path.isdir(path)
        node = {"name": name, "path": path, "type": "directory" if is_dir else "file"}

        if is_dir:
            try:
                children = []
                for entry in os.scandir(path):
                    if entry.name in (".git", "node_modules", ".venv", "__pycache__"):
                        continue
                    children.append(build_tree(entry.path))
                node["children"] = sorted(
                    children, key=lambda x: (x["type"] != "directory", x["name"])
                )
            except PermissionError:
                node["children"] = []
        return node

    if not await asyncio.to_thread(os.path.exists, project.path):
        raise HTTPException(status_code=404, detail="Project path not found on disk")

    tree = await asyncio.to_thread(build_tree, project.path)
    background_tasks.add_task(build_search_index, project.path)
    return tree


@router.get("/projects/{project_id}/files/ast-folds")
async def get_ast_folds(
    project_id: str,
    file_path: str,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    import json

    from sqlalchemy import select

    from app.domain.graph_models import NodeLabel
    from app.infrastructure.db.models import GraphNodeModel

    stmt = select(GraphNodeModel).where(
        GraphNodeModel.project_id == project_uuid,
        GraphNodeModel.file_path == file_path,
        GraphNodeModel.label.in_([NodeLabel.FUNCTION, NodeLabel.CLASS])
    )
    result = await session.execute(stmt)
    nodes = result.scalars().all()

    folds = []
    for node in nodes:
        if node.meta_data:
            try:
                meta = json.loads(node.meta_data)
                start = meta.get("start_line")
                end = meta.get("end_line")
                if start and end:
                    folds.append({
                        "start_line": start,
                        "end_line": end,
                        "type": str(node.label)
                    })
            except json.JSONDecodeError:
                pass

    return {"folds": folds}



@router.get("/projects/{project_id}/file/content")
async def get_project_file_content(
    project_id: str, path: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    candidate = resolve_project_path(project.path, path)

    if not await asyncio.to_thread(candidate.is_file):
        raise HTTPException(status_code=404, detail="File not found")

    import hashlib

    try:
        raw_content = await async_read_bytes(candidate)
        content = raw_content.decode("utf-8")
        file_hash = hashlib.sha256(raw_content).hexdigest()
        return {"content": content, "original_hash": file_hash}
    except Exception as e:
        logger.error("Failed to read file failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")


@router.put("/projects/{project_id}/file/content")
async def update_project_file_content(
    project_id: str,
    path: str,
    payload: FileContentUpdate,
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

    candidate = resolve_project_path(project.path, path)

    if not await asyncio.to_thread(candidate.is_file):
        raise HTTPException(status_code=404, detail="File not found")

    import hashlib

    try:
        # Optimistic Concurrency Control (ETag logic)
        if payload.base_hash:
            current_raw = await async_read_bytes(candidate)
            current_hash = hashlib.sha256(current_raw).hexdigest()
            if current_hash != payload.base_hash:
                raise HTTPException(
                    status_code=409, detail="File has been modified externally since last read"
                )

        await async_write_text(candidate, payload.content)

        new_raw = await async_read_bytes(candidate)
        new_hash = hashlib.sha256(new_raw).hexdigest()

        return {"status": "success", "new_hash": new_hash}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to write file failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")


@router.post("/projects/{project_id}/file/create")
async def create_project_file(
    project_id: str,
    path: str,
    payload: FileContentUpdate,
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

    candidate = resolve_project_path(project.path, path)

    if await async_exists(candidate):
        raise HTTPException(status_code=409, detail="File already exists")

    try:
        await async_mkdir_parents(candidate)
        await async_write_text(candidate, payload.content)
        return {"status": "created", "path": str(candidate.relative_to(Path(project.path).resolve()))}
    except Exception as e:
        logger.error("Failed to create file failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")



@router.post("/projects/{project_id}/file/rename")
async def rename_project_file(
    project_id: str,
    request: RenameRequest,
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

    candidate = resolve_project_path(project.path, request.path)

    if not await async_exists(candidate):
        raise HTTPException(status_code=404, detail="File not found")

    if not re.match(r"^[^/\0]+$", request.new_name):
        raise HTTPException(status_code=400, detail="Invalid file name")

    new_path = candidate.parent / request.new_name
    if not new_path.is_relative_to(Path(project.path).resolve()):
        raise HTTPException(
            status_code=403, detail="Renamed path would be outside project directory"
        )

    if await async_exists(new_path):
        raise HTTPException(status_code=409, detail="A file with that name already exists")

    try:
        await async_rename(candidate, new_path)
        relative = str(new_path.relative_to(Path(project.path).resolve()))
        return {"status": "renamed", "path": relative}
    except Exception as e:
        logger.error("Failed to rename file failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")


@router.post("/projects/{project_id}/file/duplicate")
async def duplicate_project_file(
    project_id: str,
    request: FileOperationRequest,
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

    candidate = resolve_project_path(project.path, request.path)

    if not await async_is_file(candidate):
        raise HTTPException(status_code=404, detail="File not found")

    stem = candidate.stem
    suffix = candidate.suffix
    duplicate_path = candidate.parent / f"{stem}_copy{suffix}"

    counter = 1
    while await async_exists(duplicate_path):
        duplicate_path = candidate.parent / f"{stem}_copy{counter}{suffix}"
        counter += 1

    try:
        await async_copy2(candidate, duplicate_path)
        relative = str(duplicate_path.relative_to(Path(project.path).resolve()))
        return {"status": "duplicated", "path": relative}
    except Exception as e:
        logger.error("Failed to duplicate file failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")


@router.delete("/projects/{project_id}/file/delete")
async def delete_project_file(
    project_id: str,
    path: str = Query(...),
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

    candidate = resolve_project_path(project.path, path)

    if not await async_is_file(candidate):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        await async_remove(candidate)
        return {"status": "deleted", "path": path}
    except Exception as e:
        logger.error("Failed to delete file failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")


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


def _count_tech_stack(project_root: Path) -> tuple[dict[str, int], int]:
    """Count file extensions and total files. Blocking — run inside a thread."""
    tech_stack: dict[str, int] = {}
    total_files = 0

    for dirpath, dirnames, filenames in os.walk(project_root):
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS and not d.startswith(".")]
        for filename in filenames:
            ext = Path(filename).suffix.lower()
            if ext:
                tech_stack[ext] = tech_stack.get(ext, 0) + 1
            total_files += 1
    return tech_stack, total_files


def _load_json_file(path: str) -> dict[str, Any]:
    """Load a JSON file into a dict. Blocking — run inside a thread."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _dump_json_file(path: str, data: dict[str, Any]) -> None:
    """Write a dict to a JSON file. Blocking — run inside a thread."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _collect_search_index_entries(
    root: Path,
) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    """Walk the project tree and extract symbols. Blocking — run inside a thread."""
    from app.infrastructure.scanners.symbol_extractor import extract_symbols

    inserts: list[dict[str, str]] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS and not d.startswith(".")]
        for filename in filenames:
            file_path = str(Path(dirpath) / filename)
            inserts.append({"type": "file", "name": filename, "path": file_path})

    symbol_inserts: list[dict[str, Any]] = []
    for entry in inserts:
        fp = Path(entry["path"])
        if not fp.exists() or fp.stat().st_size > MAX_FILE_BYTES:
            continue
        ext = fp.suffix.lower()
        if ext not in SOURCE_EXTENSIONS:
            continue
        try:
            content = fp.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            logger.warning("Unhandled exception", exc_info=True)
            continue
        symbols = extract_symbols(str(fp), content)
        for sym in symbols:
            symbol_inserts.append(
                {"type": "symbol", "name": sym["name"], "path": str(fp), "line": sym["line"]}
            )
    return inserts, symbol_inserts


async def build_search_index(project_root: str, session: AsyncSession | None = None) -> int:
    """Rebuild the FTS5 search index for a project directory.

    Can receive an existing session (from /analyze) or create its own
    (for background tasks). Returns total files indexed.
    """
    own_session = session is None
    if own_session:
        session = get_sessionmaker()()

    assert session is not None

    try:
        root = Path(project_root).resolve()
        await session.execute(text("DELETE FROM search_index"))

        inserts, symbol_inserts = await asyncio.to_thread(
            _collect_search_index_entries, root
        )

        if inserts:
            await session.execute(
                text("INSERT INTO search_index (type, name, path) VALUES (:type, :name, :path)"),
                inserts,
            )

        if symbol_inserts:
            await session.execute(
                text(
                    "INSERT INTO search_index (type, name, path, line) VALUES (:type, :name, :path, :line)"
                ),
                symbol_inserts,
            )

        await session.commit()
        return len(inserts)
    finally:
        if own_session and session:
            await session.close()


@router.post("/projects/{project_id}/analyze")
async def analyze_project(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_root = Path(project.path).resolve()
    if not await async_exists(project_root):
        raise HTTPException(status_code=404, detail="Project path not found on disk")

    # ── Rebuild FTS5 search index ──────────────────────────────────────
    await build_search_index(str(project_root), session)

    # ── Tech stack counting ────────────────────────────────────────────
    tech_stack, total_files = await asyncio.to_thread(
        _count_tech_stack, project_root
    )

    # ── Run language scanners ──────────────────────────────────────────
    from app.infrastructure.scanners.python_scanner import PythonScanner

    global_markers: dict = {}

    try:
        py_scanner = PythonScanner()
        py_markers = await asyncio.to_thread(py_scanner.scan, str(project_root))
        global_markers.update(py_markers)
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)
        pass  # scanner failures are non-fatal

    return {
        "tech_stack": dict(sorted(tech_stack.items(), key=lambda x: x[1], reverse=True)),
        "total_files": total_files,
        "global_markers": global_markers,
    }


@router.get("/search")
async def search_everywhere(
    q: str = Query(..., min_length=1, description="Search query"),
    session: AsyncSession = Depends(get_db_session),
):
    sanitized = f"%{q.strip()}%"
    if not sanitized or sanitized in ("%%", "%*%"):
        return {"results": []}

    try:
        result = await session.execute(
            text(
                "SELECT type, name, path, line FROM search_index "
                "WHERE name LIKE :q OR path LIKE :q OR content LIKE :q LIMIT 50"
            ),
            {"q": sanitized},
        )
        rows = result.fetchall()

        return {
            "results": [
                {
                    "type": row[0],
                    "name": row[1],
                    "path": row[2],
                    "line": row[3],
                }
                for row in rows
            ]
        }
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)
        return {"results": []}


class MemorySaveRequest(BaseModel):
    agent_name: str
    context_type: str  # architectural_decision, bug_fix, chat_summary
    memory_content: str


@router.post("/projects/{project_id}/memory")
async def save_project_memory(
    project_id: str, request: MemorySaveRequest, session: AsyncSession = Depends(get_db_session)
):
    await session.execute(
        text(
            "INSERT INTO project_memories (project_id, agent_name, context_type, memory_content) "
            "VALUES (:pid, :agent, :ctype, :content)"
        ),
        {
            "pid": project_id,
            "agent": request.agent_name.replace("'", "''"),
            "ctype": request.context_type,
            "content": request.memory_content.replace("'", "''"),
        },
    )
    await session.commit()
    return {"status": "saved"}


@router.get("/projects/{project_id}/memory/search")
async def search_project_memory(
    project_id: str,
    q: str = Query(..., min_length=1),
    session: AsyncSession = Depends(get_db_session),
):
    sanitized = q.replace("'", "''").strip()
    if not sanitized:
        return {"results": []}

    query_str = sanitized + "*"

    try:
        result = await session.execute(
            text(
                "SELECT agent_name, context_type, memory_content FROM project_memories "
                "WHERE project_memories MATCH :q AND project_id = :pid "
                "ORDER BY rank LIMIT 20"
            ),
            {"q": query_str, "pid": project_id},
        )
        rows = result.fetchall()
        return {
            "results": [
                {"agent_name": r[0], "context_type": r[1], "memory_content": r[2]} for r in rows
            ]
        }
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)
        return {"results": []}


import contextlib

from watchfiles import Change

from app.infrastructure.file_watcher import file_watcher
from app.infrastructure.kanban_sync import kanban_sync

# Global event queue for SSE per project
project_event_queues: dict[str, list[asyncio.Queue[dict[str, Any]]]] = {}


async def file_watcher_callback(project_id: str, change: Change, filepath: str):
    if project_id in project_event_queues:
        event = {"type": "file_change", "change": change.name, "filepath": filepath}
        # If tasks.md changed, send a specific kanban_update event
        if filepath.endswith("tasks.md"):
            event["type"] = "kanban_update"

        for q in project_event_queues[project_id]:
            await q.put(event)


file_watcher.add_callback(file_watcher_callback)


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


class ProposalAction(BaseModel):
    action: str  # "apply" | "reject"


@router.post("/projects/{project_id}/proposals/{proposal_id}/apply")
async def apply_proposal(project_id: str, proposal_id: str):
    import hashlib

    from app.application.ai_agent import _proposals_store

    proposal = _proposals_store.get(proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    try:
        target = Path(proposal["absolute_path"])
        current_content = await async_read_text(target, errors="ignore")
        current_hash = hashlib.sha256(current_content.encode()).hexdigest()
        expected_hash = proposal.get("original_file_hash", "")

        if expected_hash and current_hash != expected_hash:
            raise HTTPException(
                status_code=409,
                detail=(
                    "El archivo fue modificado desde que se generó esta propuesta. "
                    "Rechazala y pedile a la IA que genere una nueva propuesta "
                    "basada en la versión actual del archivo."
                ),
            )

        await async_write_text(target, proposal["new_file_content"])
        del _proposals_store[proposal_id]
        return {
            "status": "applied",
            "proposal_id": proposal_id,
            "file": proposal["file_path"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to apply proposal: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")


@router.post("/projects/{project_id}/proposals/{proposal_id}/reject")
async def reject_proposal(project_id: str, proposal_id: str):
    from app.application.ai_agent import _proposals_store

    proposal = _proposals_store.pop(proposal_id, None)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    return {
        "status": "rejected",
        "proposal_id": proposal_id,
        "file": proposal["file_path"],
    }


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


@router.get("/projects/{project_id}/tasks")
async def get_project_tasks(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tasks = await asyncio.to_thread(kanban_sync.read_tasks, project.path)
    return {"tasks": tasks}


class SaveTasksRequest(BaseModel):
    tasks: list[dict[str, Any]]


@router.post("/projects/{project_id}/tasks")
async def save_project_tasks(
    project_id: str, request: SaveTasksRequest, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await asyncio.to_thread(kanban_sync.write_tasks, project.path, request.tasks)
    return {"status": "success"}


class SaveKanbanConfigRequest(BaseModel):
    columns: list[dict[str, Any]]


class StickyNote(BaseModel):
    id: str
    content: str
    color: str
    x: float
    y: float
    timestamp: float


class UpdateStickyNotesRequest(BaseModel):
    notes: list[StickyNote]


@router.get("/projects/{project_id}/kanban/config")
async def get_kanban_config(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    config = await asyncio.to_thread(kanban_sync.get_config, project.path)
    return config


@router.post("/projects/{project_id}/kanban/config")
async def save_kanban_config(
    project_id: str,
    request: SaveKanbanConfigRequest,
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

    await asyncio.to_thread(kanban_sync.save_config, project.path, request.dict())

    # Notify active sessions via SSE to reload configuration
    if project_id in project_event_queues:
        for q in project_event_queues[project_id]:
            await q.put({"type": "kanban_update", "message": "Kanban configuration updated"})

    return {"status": "success"}


@router.get("/projects/{project_id}/notes")
async def get_project_sticky_notes(
    project_id: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    json_path = os.path.join(project.path, f"{project_id}.json")

    notes = []
    if await async_exists(json_path):
        try:
            data = await asyncio.to_thread(_load_json_file, json_path)
            notes = data.get("sticky_notes", [])
        except Exception:
            logger.warning("Unhandled exception", exc_info=True)

    return {"notes": notes}


@router.put("/projects/{project_id}/notes")
async def update_project_sticky_notes(
    project_id: str,
    request: UpdateStickyNotesRequest,
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

    json_path = os.path.join(project.path, f"{project_id}.json")

    data = {}
    if await async_exists(json_path):
        try:
            data = await asyncio.to_thread(_load_json_file, json_path)
        except Exception:
            logger.warning("Unhandled exception", exc_info=True)

    data["sticky_notes"] = [note.model_dump() for note in request.notes]

    try:
        await asyncio.to_thread(_dump_json_file, json_path, data)
    except Exception as e:
        logger.error("Failed to write sticky notes: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")

    return {"status": "success"}


async def run_workspace_tests(repo_path: str) -> bool:
    if os.path.exists(os.path.join(repo_path, "package.json")):
        cmd = ["npm", "test"]
    elif os.path.exists(os.path.join(repo_path, "pytest.ini")) or os.path.exists(
        os.path.join(repo_path, "conftest.py")
    ):
        cmd = ["pytest"]
    else:
        return True  # Default to true if no tests configured

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, cwd=repo_path, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        await proc.wait()
        return proc.returncode == 0
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)
        return True  # Fallback if command fails


@router.post("/projects/{project_id}/tasks/sync-commits")
async def sync_project_commits(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    git_gateway = LocalGitGateway()
    try:
        commits = await git_gateway.get_recent_commits(project.path, limit=20)
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)
        commits = []

    if not commits:
        return {
            "status": "success",
            "message": "No commits found or git not initialized",
            "updated_tasks": [],
        }

    tasks = await asyncio.to_thread(kanban_sync.read_tasks, project.path)
    config = await asyncio.to_thread(kanban_sync.get_config, project.path)

    # Identify target columns by rule
    done_col = next(
        (col["id"] for col in config["columns"] if col.get("rule") == "auto-on-test-pass"), "done"
    )
    test_col = next(
        (col["id"] for col in config["columns"] if col.get("rule") == "auto-on-test-fail"), "test"
    )

    updated = False
    updated_tasks = []

    # Map task ID to task
    task_map = {t["id"]: t for t in tasks}

    # Run tests in workspace to determine target column
    tests_passing = await run_workspace_tests(project.path)

    for commit in commits:
        match = re.search(r"\[(SPRT-\d+)\]", commit.get("message", ""))
        if not match:
            match = re.search(r"\b(SPRT-\d+)\b", commit.get("message", ""))

        if match:
            task_id = match.group(1)
            if task_id in task_map:
                task = task_map[task_id]
                target_status = done_col if tests_passing else test_col

                # Link commit and move status if different
                if task.get("commit") != commit.get("hash") or task["status"] != target_status:
                    task["commit"] = commit.get("hash")
                    task["status"] = target_status

                    # Update category (column title)
                    col_title = next(
                        (col["title"] for col in config["columns"] if col["id"] == target_status),
                        target_status.capitalize(),
                    )
                    task["category"] = col_title

                    updated = True
                    if task_id not in updated_tasks:
                        updated_tasks.append(task_id)

    if updated:
        await asyncio.to_thread(kanban_sync.write_tasks, project.path, tasks)
        # Notify active clients via SSE
        if project_id in project_event_queues:
            for q in project_event_queues[project_id]:
                await q.put(
                    {
                        "type": "kanban_update",
                        "message": f"Tasks synced with commits: {', '.join(updated_tasks)}",
                    }
                )

    return {"status": "success", "tests_passing": tests_passing, "updated_tasks": updated_tasks}


class WBSRequest(BaseModel):
    requirements: str
    model: str | None = None


@router.post("/projects/{project_id}/kanban/wbs", response_model=WBSHierarchicalResponse)
async def generate_wbs(
    req: Request, project_id: str, request: WBSRequest, session: AsyncSession = Depends(get_db_session)
):
    import json

    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    prompt = f"""Eres un Ingeniero de Software Principal y Gestor de Proyectos de gran experiencia. Descompón los siguientes requerimientos en una estructura jerárquica (WBS).

Requerimientos:
{request.requirements}

Instrucciones de descomposición:
1. Divide la feature en Work Packages (Epics).
2. Para cada Work Package, define subtareas atómicas y secuenciales.
3. Sugiere dependencias lógicas dentro de las subtareas de un paquete (por IDs, ej: 1.1, 1.2).
4. Estima el tamaño en horas para cada subtarea.
5. Suma el total de horas en total_estimated_hours.
6. Devuelve la salida ESTRICTAMENTE en formato JSON.

Debes responder ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{{
  "work_packages": [
    {{
      "id": "1",
      "title": "Configurar Backend",
      "objective": "Establecer la base de datos y la API.",
      "subtasks": [
        {{
          "id": "1.1",
          "title": "Modelos BD",
          "description": "Crear modelos con SQLAlchemy",
          "estimated_hours": 2.5,
          "dependencies": []
        }}
      ]
    }}
  ],
  "total_estimated_hours": 2.5
}}"""

    from app.infrastructure.ai.llm_gateway import LiteLLMGateway

    # BD source of truth: planning_studio tool override (or global default).
    wbs_provider, wbs_model, _ = await resolve_tool_model(session, "planning_studio")
    actual_model = tool_model_label(wbs_provider, wbs_model)
    llm_gateway = LiteLLMGateway()

    try:
        response_text = llm_gateway.generate_completion(
            prompt=prompt,
            model=actual_model,
            response_format={"type": "json_object"}
        )

        clean_res = response_text.strip()
        if clean_res.startswith("```json"):
            clean_res = clean_res[7:]
        elif clean_res.startswith("```"):
            clean_res = clean_res[3:]

        if clean_res.endswith("```"):
            clean_res = clean_res[:-3]

        clean_res = clean_res.strip()

        parsed_wbs = json.loads(clean_res)
        return WBSHierarchicalResponse(**parsed_wbs)
    except Exception as e:
        logger.error("WBS AI planning failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")


@router.get("/insights/flow")
async def get_global_flow_insights(
    session: AsyncSession = Depends(get_db_session),
):
    """Telemetría global de todo el desarrollador, sin filtrar por proyecto."""
    return await _compute_flow_insights(session, project_id=None)


@router.get("/projects/{project_id}/insights/flow")
async def get_project_flow_insights(
    project_id: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return await _compute_flow_insights(session, project_id=project_id)


async def _compute_flow_insights(
    session: AsyncSession,
    project_id: str | None,
) -> dict[str, object]:

    deep_flow_hours = 0.0
    idle_breaks = 0
    golden_ratio = {"thinking": 0, "coding": 0, "testing": 0}
    heatmap = []
    heatmap_matrix: list[dict[str, object]] = []

    project_filter = "AND project_id = :pid" if project_id else ""
    params: dict[str, str] = {"pid": project_id} if project_id else {}

    try:
        flow_query = text(f"""
            WITH lagged AS (
                SELECT
                    window_start_ms,
                    window_end_ms,
                    LAG(window_end_ms) OVER (ORDER BY window_start_ms) as prev_end_ms
                FROM telemetry_pings
                WHERE timestamp >= date('now', '-6 days')
                  {project_filter}
            ),
            gaps AS (
                SELECT
                    window_start_ms,
                    window_end_ms,
                    prev_end_ms,
                    CASE WHEN prev_end_ms IS NULL OR (window_start_ms - prev_end_ms) > 300000 THEN 1 ELSE 0 END as is_gap
                FROM lagged
            ),
            sessions AS (
                SELECT
                    window_start_ms,
                    window_end_ms,
                    SUM(is_gap) OVER (ORDER BY window_start_ms) as session_id
                FROM gaps
            ),
            session_durations AS (
                SELECT
                    session_id,
                    (MAX(window_end_ms) - MIN(window_start_ms)) as duration_ms
                FROM sessions
                GROUP BY session_id
            )
            SELECT
                (SELECT SUM(duration_ms) FROM session_durations) / 3600000.0 as deep_flow_hours,
                (SELECT SUM(is_gap) FROM gaps WHERE prev_end_ms IS NOT NULL) as idle_breaks
        """)
        flow_result = await session.execute(flow_query, params)
        flow_row = flow_result.fetchone()
        if flow_row:
            deep_flow_hours = round(flow_row[0] or 0.0, 2)
            idle_breaks = max(0, flow_row[1] or 0)

        ratio_query = text(f"""
            SELECT
                SUM(thinking_ms) as t,
                SUM(coding_ms) as c,
                SUM(testing_ms) as ts
            FROM telemetry_pings
            WHERE timestamp >= date('now', '-6 days')
              {project_filter}
        """)
        ratio_result = await session.execute(ratio_query, params)
        r_row = ratio_result.fetchone()
        if r_row:
            golden_ratio = {
                "thinking": r_row[0] or 0,
                "coding": r_row[1] or 0,
                "testing": r_row[2] or 0,
            }

        heatmap_query = text(f"""
            SELECT
                strftime('%H', timestamp) as hour,
                SUM(thinking_ms + coding_ms + testing_ms) as total_ms
            FROM telemetry_pings
            WHERE timestamp >= date('now', '-6 days')
              {project_filter}
            GROUP BY hour
            ORDER BY hour
        """)
        heatmap_result = await session.execute(heatmap_query, params)
        for row in heatmap_result.fetchall():
            if row[0]:
                heatmap.append({"hour": f"{row[0]}:00", "activity": row[1] or 0})

        heatmap_matrix_query = text(f"""
            SELECT
                date(timestamp) as day,
                strftime('%H', timestamp) as hour,
                SUM(thinking_ms + coding_ms + testing_ms) as total_ms
            FROM telemetry_pings
            WHERE timestamp >= date('now', '-6 days')
              {project_filter}
            GROUP BY day, hour
            ORDER BY day, hour
        """)
        matrix_result = await session.execute(heatmap_matrix_query, params)
        for row in matrix_result.fetchall():
            if row[0] and row[1]:
                heatmap_matrix.append({
                    "date": row[0],
                    "hour": f"{row[1]}:00",
                    "activity": row[2] or 0,
                })
    except Exception as e:
        import logging

        logging.error(f"Telemetry query failed: {e}")

    return {
        "deep_flow_hours": deep_flow_hours,
        "idle_breaks": idle_breaks,
        "golden_ratio": golden_ratio,
        "heatmap": heatmap,
        "heatmap_matrix": heatmap_matrix,
    }


@router.get("/projects/{project_id}/insights/repo")
async def get_project_repo_insights(
    project_id: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tasks_by_state = {"todo": 0, "in-progress": 0, "done": 0}
    try:
        import asyncio

        tasks = await asyncio.to_thread(kanban_sync.read_tasks, project.path)
        for t in tasks:
            if t["status"] in tasks_by_state:
                tasks_by_state[t["status"]] += 1
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)

    from sqlalchemy import select

    from app.infrastructure.db.models import GraphNodeModel

    nodes_result = await session.execute(
        select(GraphNodeModel.file_path).where(GraphNodeModel.project_id == project_uuid)
    )
    extensions: dict[str, int] = {}
    for (file_path,) in nodes_result:
        ext = os.path.splitext(file_path)[1]
        if ext:
            ext = ext[1:].lower()
            extensions[ext] = extensions.get(ext, 0) + 1

    sorted_items = sorted(extensions.items(), key=lambda item: item[1], reverse=True)
    sorted_exts = [{"name": k, "value": v} for k, v in sorted_items]

    git_gateway = LocalGitGateway()
    total_commits = 0
    active_branches = 0
    velocity = 0
    recent_commits: list[dict[str, object]] = []
    try:
        out_commits = await git_gateway._run_command(project.path, "rev-list", "--all", "--count")
        total_commits = int(out_commits)
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)

    try:
        out_branches = await git_gateway._run_command(project.path, "branch")
        active_branches = len([b for b in out_branches.split("\n") if b.strip()])
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)

    try:
        out_velocity = await git_gateway._run_command(
            project.path, "rev-list", "--count", '--since="7 days ago"', "HEAD"
        )
        velocity = int(out_velocity) if out_velocity.strip().isdigit() else 0
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)

    try:
        recent_commits = await git_gateway.get_recent_commits(project.path, limit=5)
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)

    return {
        "tasks_by_state": tasks_by_state,
        "language_distribution": sorted_exts,
        "total_commits": total_commits,
        "active_branches": active_branches,
        "velocity": velocity,
        "recent_commits": recent_commits,
    }

@router.get("/projects/{project_id}/graph/export/md")
async def export_project_graph_md(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
        repo = SQLAlchemyProjectRepository(session)
        project = await repo.get_project(project_uuid)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        from app.application.graph_exporter import generate_codebase_map_md
        md_content = await generate_codebase_map_md(
            project_id=project_uuid,
            session=session,
            max_files=None, # Rest endpoint returns all
            project_path=project.path
        )
        return PlainTextResponse(content=md_content)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
