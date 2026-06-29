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
    
    await scan_codebase_usecase.execute(request.path)
    
    return {"project_id": str(saved_project.id)}

@router.get("/projects/{project_id}/graph")
async def get_project_graph(project_id: str, session: AsyncSession = Depends(get_db_session)):
    # Update last opened time since we are fetching the graph
    try:
        project_uuid = UUID(project_id)
        repo = SQLAlchemyProjectRepository(session)
        await repo.update_last_opened(project_uuid)
    except ValueError:
        pass

    graph_repo = SQLAlchemyGraphRepository(session)
    nodes = await graph_repo.get_all_nodes()
    edges = await graph_repo.get_all_edges()
    
    import os
    nodes_dict = []
    for n in nodes:
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
        for e in edges
    ]
    
    return {"nodes": nodes_dict, "links": links_dict}

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
