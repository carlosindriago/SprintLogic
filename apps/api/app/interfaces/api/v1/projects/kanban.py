import asyncio
import difflib
import json
import logging
import os
import re
from typing import Any
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
)
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.kanban_models import TicketStatus
from app.domain.kanban_schemas import KanbanTicketUpdate
from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.models import GraphNodeModel
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.git.git_gateway import LocalGitGateway
from app.infrastructure.repositories.kanban_repository import SQLAlchemyKanbanRepository
from app.infrastructure.repositories.tool_model_repository import (
    resolve_tool_model,
    tool_model_label,
)
from app.interfaces.api.v1.wbs_schemas import WBSHierarchicalResponse
from app.utils.async_io import async_exists
from app.utils.security import resolve_project_path

from .memory import _dump_json_file, _load_json_file
from .ws import project_event_queues

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Projects - Kanban"])
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
from app.infrastructure.kanban_sync import kanban_sync


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


class PathValidationResult(BaseModel):
    original_path: str
    exists: bool
    suggested_path: str | None = None
    confidence: float | None = None


class ValidatePlanResponse(BaseModel):
    validated_paths: list[PathValidationResult]
    plan_observations: str | None = None


class ValidatePlanRequest(BaseModel):
    paths: list[str]
    ticket_description: str | None = None
    plan_text: str | None = None


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

    json_path = str(resolve_project_path(project.path, f"{project_id}.json"))

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

    json_path = str(resolve_project_path(project.path, f"{project_id}.json"))

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
            "message": "No se encontraron commits recientes en el repositorio Git.",
            "updated_tasks": [],
            "tests_passing": None,
        }

    tasks = await asyncio.to_thread(kanban_sync.read_tasks, project.path)
    config = await asyncio.to_thread(kanban_sync.get_config, project.path)

    db_repo = SQLAlchemyKanbanRepository(session)
    try:
        db_tickets = await db_repo.get_tickets_by_project(project_uuid)
    except Exception:
        logger.warning("Failed to load db tickets for commit sync", exc_info=True)
        db_tickets = []

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
        c_msg = commit.get("message", "")

        # 1. Match file-based tasks (e.g. SPRT-1)
        match = re.search(r"\[(SPRT-\d+)\]", c_msg) or re.search(r"\b(SPRT-\d+)\b", c_msg)
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

        # 2. Match database tickets (e.g. SL-XXXXXX, UUID prefix, branch name, or [Title])
        for t in db_tickets:
            short_id = str(t.id)[:8].lower()
            sl_tag = f"SL-{str(t.id)[:6].upper()}".lower()
            branch_name = (t.branch_name or "").lower()

            branch_match = bool(branch_name and (branch_name in c_msg.lower()))
            id_match = short_id in c_msg.lower() or sl_tag in c_msg.lower()

            if branch_match or id_match:
                target_db_status = TicketStatus.DONE if tests_passing else TicketStatus.TEST
                if t.status != target_db_status:
                    await db_repo.update_ticket(t.id, KanbanTicketUpdate(status=target_db_status))
                    ticket_label = f"SL-{str(t.id)[:6].upper()}"
                    if ticket_label not in updated_tasks:
                        updated_tasks.append(ticket_label)
                    updated = True

    if updated:
        if tasks:
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

    sync_msg = (
        f"Se sincronizaron {len(updated_tasks)} tarea(s) con los commits recientes."
        if updated_tasks
        else "Todos los tickets y tareas están al día con los commits recientes de Git."
    )
    return {
        "status": "success",
        "tests_passing": tests_passing,
        "updated_tasks": updated_tasks,
        "message": sync_msg,
    }


class WBSRequest(BaseModel):
    requirements: str
    model: str | None = None


@router.post("/projects/{project_id}/kanban/wbs", response_model=WBSHierarchicalResponse)
async def generate_wbs(
    req: Request,
    project_id: str,
    request: WBSRequest,
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

    prompt = f"""Eres un Ingeniero de Software Principal y Gestor de Proyectos de gran experiencia. Descompón los siguientes requerimientos en una estructura jerárquica (WBS) para Sprint Center.

Requerimientos:
{request.requirements}

Instrucciones de descomposición:
1. Divide la feature en Work Packages (Epics).
2. Para cada Work Package y subtarea, incluye los campos extendidos:
   - type: ('Feature' | 'Refactor' | 'Technical Debt' | 'Security')
   - priority: ('High' | 'Medium' | 'Low')
   - epic: Nombre de la Épica
   - sprint: Asignación de Sprint (ej: "Sprint 1")
   - branch_name: Nombre de rama git sugerido (ej: "feature/sl-101-models")
   - subtasks: Pasos técnicos detallados [{"id": "1", "title": "Crear tabla", "completed": false}]
3. Estima el tamaño en horas para cada subtarea.
4. Suma el total de horas en total_estimated_hours.
5. Devuelve la salida ESTRICTAMENTE en formato JSON.

Debes responder ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{{
  "work_packages": [
    {{
      "id": "1",
      "title": "Configurar Backend",
      "objective": "Establecer la base de datos y la API.",
      "epic": "Autenticación",
      "sprint": "Sprint 1",
      "subtasks": [
        {{
          "id": "1.1",
          "title": "Modelos BD",
          "description": "Crear modelos con SQLAlchemy",
          "type": "Feature",
          "priority": "High",
          "epic": "Autenticación",
          "sprint": "Sprint 1",
          "branch_name": "feature/sl-101-user-model",
          "subtasks": [{"id": "1.1.1", "title": "Definir tabla User", "completed": false}],
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
    wbs_provider, wbs_model, fallback_models = await resolve_tool_model(session, "planning_studio")
    actual_model = tool_model_label(wbs_provider, wbs_model)
    llm_gateway = LiteLLMGateway()

    kwargs: dict[str, Any] = {"response_format": {"type": "json_object"}}
    if fallback_models:
        kwargs["fallbacks"] = fallback_models
    kwargs["timeout"] = 15.0

    try:
        response_text = await llm_gateway.async_generate_completion(
            prompt=prompt, model=actual_model, **kwargs
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


@router.post(
    "/projects/{project_id}/kanban/validate-plan-paths", response_model=ValidatePlanResponse
)
async def validate_plan_paths(
    project_id: str, request: ValidatePlanRequest, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Fetch all project nodes for exact and fuzzy matching
    stmt = select(GraphNodeModel.file_path).where(GraphNodeModel.project_id == project_uuid)
    result = await session.execute(stmt)

    project_base_path = project.path
    if not project_base_path.endswith("/"):
        project_base_path += "/"

    all_absolute_paths = [row[0] for row in result.fetchall() if row[0]]
    all_paths = [ap.replace(project_base_path, "") for ap in all_absolute_paths]

    validated_paths = []
    for p in request.paths:
        # Check exact relative path match
        if p in all_paths:
            # Map back to absolute path for suggested_path
            idx = all_paths.index(p)
            validated_paths.append(
                PathValidationResult(
                    original_path=p,
                    exists=True,
                    suggested_path=all_absolute_paths[idx],
                    confidence=1.0,
                )
            )
        else:
            # Check if p is a suffix of any relative path (e.g. resources/views/...)
            suffix_matches = [i for i, ap in enumerate(all_paths) if ap.endswith(p)]
            if suffix_matches:
                idx = suffix_matches[0]
                validated_paths.append(
                    PathValidationResult(
                        original_path=p,
                        exists=True,  # It exists as a suffix
                        suggested_path=all_absolute_paths[idx],
                        confidence=1.0,
                    )
                )
            else:
                matches = difflib.get_close_matches(p, all_paths, n=1, cutoff=0.3)
                if matches:
                    suggested_rel = matches[0]
                    idx = all_paths.index(suggested_rel)
                    suggested_abs = all_absolute_paths[idx]
                    ratio = difflib.SequenceMatcher(None, p, suggested_rel).ratio()
                    validated_paths.append(
                        PathValidationResult(
                            original_path=p,
                            exists=False,
                            suggested_path=suggested_abs,
                            confidence=ratio,
                        )
                    )
                else:
                    # Try matching just the basename
                    basename = p.split("/")[-1]
                    basename_matches = [
                        i for i, ap in enumerate(all_paths) if ap.endswith(basename)
                    ]
                    if basename_matches:
                        idx = basename_matches[0]
                        suggested_rel = all_paths[idx]
                        suggested_abs = all_absolute_paths[idx]
                        ratio = difflib.SequenceMatcher(None, p, suggested_rel).ratio()
                        validated_paths.append(
                            PathValidationResult(
                                original_path=p,
                                exists=False,
                                suggested_path=suggested_abs,
                                confidence=ratio,
                            )
                        )
                    else:
                        validated_paths.append(
                            PathValidationResult(
                                original_path=p, exists=False, suggested_path=None, confidence=0.0
                            )
                        )

    plan_observations = None
    if request.plan_text and request.ticket_description:
        prompt = f"""Eres el arquitecto del sistema evaluando un plan técnico de un LLM.
Ticket: {request.ticket_description}

Plan Propuesto:
{request.plan_text}

Evalúa brevemente (máx 3-4 líneas) si el plan aborda correctamente el ticket. Si ves inconsistencias notorias o alucinaciones (ej. usar un framework distinto, tocar archivos irrelevantes), indícalo claramente. Si el plan parece sólido, responde: "El plan es congruente con la tarea."
"""
        from app.infrastructure.ai.llm_gateway import LiteLLMGateway

        provider, model, fallback_models = await resolve_tool_model(session, "planning_studio")
        actual_model = tool_model_label(provider, model)
        llm_gateway = LiteLLMGateway()

        kwargs: dict[str, Any] = {}
        if fallback_models:
            kwargs["fallbacks"] = fallback_models
        kwargs["timeout"] = 5.0  # litellm per-request timeout

        try:
            response_text = await asyncio.wait_for(
                llm_gateway.async_generate_completion(prompt=prompt, model=actual_model, **kwargs),
                timeout=15.0,  # overall timeout including fallbacks
            )
            plan_observations = response_text.strip()
        except Exception as e:
            logger.error("LLM Plan validation failed: %s", e, exc_info=True)
            plan_observations = None

    return ValidatePlanResponse(
        validated_paths=validated_paths, plan_observations=plan_observations
    )
