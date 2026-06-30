from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from uuid import UUID

from app.infrastructure.db.database import get_db_session
from app.infrastructure.git.git_gateway import LocalGitGateway
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.repositories.graph_repository import SQLAlchemyGraphRepository
from app.infrastructure.parser.ast_parser import ASTParserService
from app.application.scan_repo import ScanLocalRepository
from app.application.scan_codebase import ScanCodebaseUseCase

router = APIRouter()

class ScanRequest(BaseModel):
    path: str

@router.get("/projects")
async def get_projects(session: AsyncSession = Depends(get_db_session)):
    repo = SQLAlchemyProjectRepository(session)
    projects = await repo.get_all_projects()
    return {"projects": projects}

@router.post("/projects/scan")
async def scan_project(request: ScanRequest, session: AsyncSession = Depends(get_db_session)):
    git_gateway = LocalGitGateway()
    project_repo = SQLAlchemyProjectRepository(session)
    scan_repo_usecase = ScanLocalRepository(git_gateway, project_repo)
    
    try:
        saved_project = await scan_repo_usecase.execute(request.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    parser = ASTParserService()
    graph_repo = SQLAlchemyGraphRepository(session)
    scan_codebase_usecase = ScanCodebaseUseCase(parser, graph_repo)
    
    await scan_codebase_usecase.execute(saved_project.id, request.path)
    
    return {"project_id": str(saved_project.id)}

@router.get("/projects/{project_id}/graph")
async def get_project_graph(project_id: str, session: AsyncSession = Depends(get_db_session)):
    # Update last opened time since we are fetching the graph
    try:
        project_uuid = UUID(project_id)
        repo = SQLAlchemyProjectRepository(session)
        project = await repo.get_project(project_uuid)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        await repo.update_last_opened(project_uuid)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    graph_repo = SQLAlchemyGraphRepository(session)
    nodes = await graph_repo.get_nodes_by_project(project_uuid)
    edges = await graph_repo.get_edges_by_project(project_uuid)
    
    import os
    project_path = os.path.abspath(project.path)
    
    # Filter nodes by project path to ensure we don't mix projects
    filtered_nodes = [n for n in nodes if os.path.abspath(n.file_path).startswith(project_path)]
    valid_node_ids = {n.id for n in filtered_nodes}
    
    # Filter edges to only include those between valid nodes
    filtered_edges = [e for e in edges if e.source_id in valid_node_ids and e.target_id in valid_node_ids]
    
    nodes_dict = []
    for n in filtered_nodes:
        label_val = n.label.value if hasattr(n.label, 'value') else n.label
        node_dict = {
            "id": n.id,
            "label": label_val,
            "name": n.name,
            "file_path": n.file_path
        }
        if label_val == "File":
            try:
                node_dict["size"] = os.path.getsize(n.file_path)
            except Exception:
                node_dict["size"] = 1000 # default fallback
        nodes_dict.append(node_dict)
    
    links_dict = [
        {
            "source": e.source_id,
            "target": e.target_id,
            "type": e.type.value if hasattr(e.type, 'value') else e.type
        }
        for e in filtered_edges
    ]
    
    return {"nodes": nodes_dict, "links": links_dict}

from sqlalchemy import select
from app.infrastructure.db.models import ProjectModel, GraphNodeModel

@router.get("/projects/{project_id}/nodes/{node_id:path}")
async def get_node_details(project_id: str, node_id: str, session: AsyncSession = Depends(get_db_session)):
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
        "metadata": node.meta_data
    }

@router.get("/projects/{project_id}/files")
async def get_project_files(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
        
    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    import os
    
    def build_tree(path):
        name = os.path.basename(path)
        is_dir = os.path.isdir(path)
        node = {"name": name, "path": path, "type": "directory" if is_dir else "file"}
        
        if is_dir:
            try:
                children = []
                for entry in os.scandir(path):
                    if entry.name in ('.git', 'node_modules', '.venv', '__pycache__'):
                        continue
                    children.append(build_tree(entry.path))
                node["children"] = sorted(children, key=lambda x: (x['type'] != 'directory', x['name']))
            except PermissionError:
                node["children"] = []
        return node

    if not os.path.exists(project.path):
        raise HTTPException(status_code=404, detail="Project path not found on disk")
        
    tree = build_tree(project.path)
    return tree

@router.get("/projects/{project_id}/file/content")
async def get_project_file_content(project_id: str, path: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
        
    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    import os
    if not os.path.exists(path) or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")
        
    # Basic security check: ensure path is inside project.path
    if not os.path.abspath(path).startswith(os.path.abspath(project.path)):
        raise HTTPException(status_code=403, detail="Path is outside project directory")

    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from sse_starlette.sse import EventSourceResponse
import asyncio
from app.infrastructure.kanban_sync import kanban_sync
from app.infrastructure.file_watcher import file_watcher
from watchfiles import Change

# Global event queue for SSE per project
project_event_queues: Dict[str, List[asyncio.Queue]] = {}

async def file_watcher_callback(project_id: str, change: Change, filepath: str):
    if project_id in project_event_queues:
        event = {
            "type": "file_change",
            "change": change.name,
            "filepath": filepath
        }
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

    q = asyncio.Queue()
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

    tasks = kanban_sync.read_tasks(project.path)
    return {"tasks": tasks}

class SaveTasksRequest(BaseModel):
    tasks: List[Dict[str, Any]]

@router.post("/projects/{project_id}/tasks")
async def save_project_tasks(project_id: str, request: SaveTasksRequest, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    kanban_sync.write_tasks(project.path, request.tasks)
    return {"status": "success"}

@router.get("/projects/{project_id}/insights")
async def get_project_insights(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 1. Tareas por estado
    tasks = kanban_sync.read_tasks(project.path)
    tasks_by_state = {"todo": 0, "in-progress": 0, "done": 0}
    for t in tasks:
        if t["status"] in tasks_by_state:
            tasks_by_state[t["status"]] += 1

    # 2. Distribución de archivos/lenguajes (Query GraphNodeModel)
    from sqlalchemy import select
    from app.infrastructure.db.models import GraphNodeModel
    import os

    nodes_result = await session.execute(
        select(GraphNodeModel.file_path).where(GraphNodeModel.project_id == project_uuid)
    )
    extensions = {}
    for (file_path,) in nodes_result:
        ext = os.path.splitext(file_path)[1]
        if ext:
            ext = ext[1:].lower()
            extensions[ext] = extensions.get(ext, 0) + 1

    # Sort extensions by count descending
    sorted_exts = sorted([{"name": k, "value": v} for k, v in extensions.items()], key=lambda x: x["value"], reverse=True)

    # 3. Total de Commits, Ramas activas y Logs recientes
    git_gateway = LocalGitGateway()
    total_commits = 0
    active_branches = 0
    recent_commits = []
    try:
        out_commits = await git_gateway._run_command(project.path, 'rev-list', '--all', '--count')
        total_commits = int(out_commits)
        out_branches = await git_gateway._run_command(project.path, 'branch')
        active_branches = len([b for b in out_branches.split('\n') if b.strip()])
        recent_commits = await git_gateway.get_recent_commits(project.path, limit=5)
    except Exception:
        pass

    return {
        "tasks_by_state": tasks_by_state,
        "language_distribution": sorted_exts[:5],
        "total_commits": total_commits,
        "active_branches": active_branches,
        "velocity": int(tasks_by_state.get("done", 0) * 1.5),
        "recent_commits": recent_commits
    }
