import asyncio
import json
import logging
import os
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any
from uuid import UUID

import litellm
import networkx as nx
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
)
from fastapi.responses import PlainTextResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.analyze_project_graph import AnalyzeProjectGraphUseCase
from app.domain.graph_schemas import BlastRadiusItem, BlastRadiusResponse
from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.models import GraphNodeModel, ProjectModel
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.repositories.graph_repository import SQLAlchemyGraphRepository
from app.infrastructure.repositories.tool_model_repository import (
    resolve_tool_model,
    tool_model_label,
)
from app.infrastructure.security.credential_manager import CredentialManager
from app.infrastructure.security.rate_limiter import require_rate_limit
from app.interfaces.api.v1.project_schemas import (
    AnalyzeGraphRequest,
)
from app.utils.security import resolve_project_path

logger = logging.getLogger(__name__)
graph_cache: dict[str, tuple[dict, float]] = {}
router = APIRouter(tags=["Projects - Graph"])

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


@router.get("/projects/{project_id}/graph")
async def get_project_graph(
    project_id: str,
    expanded_folders: str | None = None,
    session: AsyncSession = Depends(get_db_session),
):
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
    filtered_nodes = [n for n in nodes if Path(n.file_path).resolve().is_relative_to(Path(project_path))]
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
        collapsed = collapse_graph_by_density(
            nodes_dict, links_dict, max_density=15, expanded_folders=expanded_set
        )

    collapsed["framework"] = _detect_project_framework(project.path)

    graph_cache[cache_key] = (collapsed, time.time())

    return collapsed


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
    if any(
        k in path_lower
        for k in ["components/", "views/", "resources/js/", "pages/", "src/app/", "ui/"]
    ):
        return "frontend"
    if any(
        k in path_lower for k in ["service", "usecase", "repository", "application/", "domain/"]
    ):
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
    api_key = CredentialManager.get_api_key(
        f"sprintlogic_{provider_id}"
    ) or CredentialManager.get_api_key(provider_id)
    if not api_key:
        api_key = CredentialManager.get_api_key("sprintlogic_openrouter")
        if not api_key:
            raise HTTPException(status_code=400, detail=f"API key for {provider_id} not configured")

    from app.infrastructure.ai.provider_adapter import ProviderAdapter
    from app.interfaces.api.v1.ai import _normalize_model_name

    adapted = ProviderAdapter.adapt(actual_model, api_key)
    normalized_model = _normalize_model_name(adapted["model"])

    from app.infrastructure.repositories.prompt_repository import get_prompt_async

    prompt_record = await get_prompt_async(session, "graph_node_insight")
    system_prompt = (
        prompt_record.content
        if prompt_record
        else "Eres un arquitecto de software experto. Analiza este código y genera un resumen técnico directo de máximo 3 líneas sobre su responsabilidad principal en el sistema. No uses saludos."
    )

    user_msg = f"Archivo: {node.file_path}\nNombre: {node.name}\n\nCódigo fuente:\n```\n{file_content[:6000]}\n```"

    try:
        response = await litellm.acompletion(
            model=normalized_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            api_key=adapted["api_key"],
            **adapted["kwargs"],
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


@router.post("/projects/{project_id}/graph/analyze")
async def analyze_project_graph(
    req: Request,
    project_id: str,
    request: AnalyzeGraphRequest,
    session: AsyncSession = Depends(get_db_session),
    _rate_limit: None = Depends(
        require_rate_limit(limit=10, window_seconds=60, scope="graph_analyze")
    ),
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
    if (
        not target_id.startswith("file:")
        and not target_id.startswith("class:")
        and not target_id.startswith("func:")
    ):
        target_id = f"file:{node_id}"

    node_result = await session.execute(
        select(GraphNodeModel).where(
            GraphNodeModel.project_id == proj_uuid,
            (GraphNodeModel.id == target_id)
            | (GraphNodeModel.file_path == node_id)
            | (GraphNodeModel.name == node_id),
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
    except Exception:
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
            max_files=None,  # Rest endpoint returns all
            project_path=project.path,
        )
        return PlainTextResponse(content=md_content)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
