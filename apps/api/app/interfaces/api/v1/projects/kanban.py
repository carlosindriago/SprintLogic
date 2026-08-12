import asyncio
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
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.git.git_gateway import LocalGitGateway
from app.infrastructure.repositories.tool_model_repository import (
    resolve_tool_model,
    tool_model_label,
)
from app.interfaces.api.v1.wbs_schemas import WBSHierarchicalResponse
from app.utils.async_io import (
    async_exists,
)

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
MAX_FILE_BYTES = 500_000
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
