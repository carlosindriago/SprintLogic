from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from uuid import UUID
from pathlib import Path

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

class FileContentUpdate(BaseModel):
    content: str

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

class UpdateProjectRequest(BaseModel):
    name: str | None = None
    path: str | None = None

@router.put("/projects/{project_id}")
async def update_project(project_id: str, request: UpdateProjectRequest, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
        
    repo = SQLAlchemyProjectRepository(session)
    project = await repo.update_project(project_uuid, name=request.name, path=request.path)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    return {"status": "success", "project": {"id": str(project.id), "name": project.name, "path": project.path}}

@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
        
    repo = SQLAlchemyProjectRepository(session)
    success = await repo.delete_project(project_uuid)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
        
    return {"status": "success"}

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
    
    # Calculate degrees
    in_degree = {n_id: 0 for n_id in valid_node_ids}
    out_degree = {n_id: 0 for n_id in valid_node_ids}
    adj = {n_id: [] for n_id in valid_node_ids}
    
    for e in filtered_edges:
        in_degree[e.target_id] += 1
        out_degree[e.source_id] += 1
        adj[e.source_id].append(e.target_id)
        
    # Tarjan's SCC to find cycles
    index_counter = [0]
    index = {}
    lowlink = {}
    stack = []
    on_stack = set()
    sccs = []
    
    def strongconnect(v):
        index[v] = index_counter[0]
        lowlink[v] = index_counter[0]
        index_counter[0] += 1
        stack.append(v)
        on_stack.add(v)
        
        for w in adj[v]:
            if w not in index:
                strongconnect(w)
                lowlink[v] = min(lowlink[v], lowlink[w])
            elif w in on_stack:
                lowlink[v] = min(lowlink[v], index[w])
                
        if lowlink[v] == index[v]:
            scc = set()
            while True:
                w = stack.pop()
                on_stack.remove(w)
                scc.add(w)
                if w == v:
                    break
            sccs.append(scc)
            
    for v in adj:
        if v not in index:
            strongconnect(v)
            
    node_to_scc = {}
    for i, scc in enumerate(sccs):
        if len(scc) > 1:
            for v in scc:
                node_to_scc[v] = i
    
    nodes_dict = []
    for n in filtered_nodes:
        label_val = n.label.value if hasattr(n.label, 'value') else n.label
        
        try:
            rel_path = os.path.relpath(n.file_path, project_path)
            folder = os.path.dirname(rel_path) or "/"
        except Exception:
            folder = "/"
            
        node_dict = {
            "id": n.id,
            "label": label_val,
            "name": n.name,
            "file_path": n.file_path,
            "folder": folder,
            "in_degree": in_degree.get(n.id, 0),
            "out_degree": out_degree.get(n.id, 0)
        }
        if label_val == "File":
            try:
                node_dict["size"] = os.path.getsize(n.file_path)
                with open(n.file_path, 'r', encoding='utf-8') as f:
                    node_dict["loc"] = sum(1 for _ in f)
            except Exception:
                node_dict["size"] = 1000 # default fallback
                node_dict["loc"] = 0
        nodes_dict.append(node_dict)
    
    links_dict = []
    for e in filtered_edges:
        is_cycle = False
        if e.source_id in node_to_scc and e.target_id in node_to_scc:
            if node_to_scc[e.source_id] == node_to_scc[e.target_id]:
                is_cycle = True
                
        links_dict.append({
            "source": e.source_id,
            "target": e.target_id,
            "type": e.type.value if hasattr(e.type, 'value') else e.type,
            "is_cycle": is_cycle
        })
    
    return {"nodes": nodes_dict, "links": links_dict}

class AnalyzeGraphRequest(BaseModel):
    model: str = "gemini/gemini-2.5-flash"

@router.post("/projects/{project_id}/graph/analyze")
async def analyze_project_graph(
    project_id: str, 
    request: AnalyzeGraphRequest, 
    session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
        repo = SQLAlchemyProjectRepository(session)
        project = await repo.get_project(project_uuid)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
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
    
    nodes_summary = []
    for n in filtered_nodes:
        label_val = n.label.value if hasattr(n.label, 'value') else n.label
        try:
            rel_path = os.path.relpath(n.file_path, project_path)
        except Exception:
            rel_path = n.file_path
        nodes_summary.append(f"- {rel_path} ({label_val}): {n.name}")
        
    edges_summary = []
    for e in filtered_edges:
        edge_type = e.type.value if hasattr(e.type, 'value') else e.type
        src_node = next((n for n in filtered_nodes if n.id == e.source_id), None)
        tgt_node = next((n for n in filtered_nodes if n.id == e.target_id), None)
        if src_node and tgt_node:
            try:
                src_rel = os.path.relpath(src_node.file_path, project_path)
                tgt_rel = os.path.relpath(tgt_node.file_path, project_path)
            except Exception:
                src_rel = src_node.file_path
                tgt_rel = tgt_node.file_path
            edges_summary.append(f"- {src_rel} ({src_node.name}) {edge_type} {tgt_rel} ({tgt_node.name})")

    # Limit summary sizes to avoid prompt overflow
    nodes_text = "\n".join(nodes_summary[:200])
    if len(nodes_summary) > 200:
        nodes_text += f"\n... (and {len(nodes_summary) - 200} more nodes)"
        
    edges_text = "\n".join(edges_summary[:200])
    if len(edges_summary) > 200:
        edges_text += f"\n... (and {len(edges_summary) - 200} more edges)"

    prompt = f"""Analiza la estructura de este proyecto de software basándote en su grafo de dependencias de código.
Ruta del proyecto: {project.path}
Nombre del proyecto: {project.name}

Componentes del Grafo (Nodos):
{nodes_text}

Relaciones/Dependencias (Enlaces):
{edges_text}

Por favor, realiza un análisis profesional y exhaustivo del proyecto:
1. Explica brevemente de qué trata este proyecto y qué tecnologías predominan (lenguajes, frameworks).
2. Describe la arquitectura del código basándote en la estructura de carpetas y dependencias (Hexagonal, MVC, Monolito, etc.).
3. Identifica posibles problemas de diseño, dependencias circulares o cuellos de botella estructurales.
4. Sugiere mejoras específicas para la calidad del código, modularidad y mantenibilidad.

Responde en formato Markdown limpio, directo y profesional. Usa títulos y listas para que sea fácil de leer."""

    from app.infrastructure.ai.llm_gateway import LiteLLMGateway
    llm_gateway = LiteLLMGateway()
    
    try:
        analysis = llm_gateway.generate_completion(prompt=prompt, model=request.model)
        return {"analysis": analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fallo en la llamada a la IA: {str(e)}")

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
    project_root = Path(project.path).resolve()
    target = Path(path)
    candidate = (target if target.is_absolute() else project_root / target).resolve()

    # Security check FIRST: must be strictly inside the project root.
    if not candidate.is_relative_to(project_root):
        raise HTTPException(status_code=403, detail="Path is outside project directory")

    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with open(candidate, "r", encoding="utf-8") as f:
            content = f.read()
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")

@router.put("/projects/{project_id}/file/content")
async def update_project_file_content(project_id: str, path: str, payload: FileContentUpdate, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    import os
    project_root = Path(project.path).resolve()
    target = Path(path)
    candidate = (target if target.is_absolute() else project_root / target).resolve()

    # Security check FIRST: must be strictly inside the project root.
    if not candidate.is_relative_to(project_root):
        raise HTTPException(status_code=403, detail="Path is outside project directory")

    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with open(candidate, "w", encoding="utf-8") as f:
            f.write(payload.content)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write file: {str(e)}")

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

class SaveKanbanConfigRequest(BaseModel):
    columns: List[Dict[str, Any]]

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

    config = kanban_sync.get_config(project.path)
    return config

@router.post("/projects/{project_id}/kanban/config")
async def save_kanban_config(project_id: str, request: SaveKanbanConfigRequest, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    kanban_sync.save_config(project.path, request.dict())
    
    # Notify active sessions via SSE to reload configuration
    if project_id in project_event_queues:
        for q in project_event_queues[project_id]:
            await q.put({"type": "kanban_update", "message": "Kanban configuration updated"})
            
    return {"status": "success"}

import asyncio
import re

async def run_workspace_tests(repo_path: str) -> bool:
    import os
    if os.path.exists(os.path.join(repo_path, "package.json")):
        cmd = ["npm", "test"]
    elif os.path.exists(os.path.join(repo_path, "pytest.ini")) or os.path.exists(os.path.join(repo_path, "conftest.py")):
        cmd = ["pytest"]
    else:
        return True # Default to true if no tests configured
    
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.wait()
        return proc.returncode == 0
    except Exception:
        return True # Fallback if command fails

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
        commits = []

    if not commits:
        return {"status": "success", "message": "No commits found or git not initialized", "updated_tasks": []}

    tasks = kanban_sync.read_tasks(project.path)
    config = kanban_sync.get_config(project.path)
    
    # Identify target columns by rule
    done_col = next((col["id"] for col in config["columns"] if col.get("rule") == "auto-on-test-pass"), "done")
    test_col = next((col["id"] for col in config["columns"] if col.get("rule") == "auto-on-test-fail"), "test")

    updated = False
    updated_tasks = []

    # Map task ID to task
    task_map = {t["id"]: t for t in tasks}

    # Run tests in workspace to determine target column
    tests_passing = await run_workspace_tests(project.path)

    for commit in commits:
        match = re.search(r"\[(SPRT-\d+)\]", commit.message)
        if not match:
            match = re.search(r"\b(SPRT-\d+)\b", commit.message)
            
        if match:
            task_id = match.group(1)
            if task_id in task_map:
                task = task_map[task_id]
                target_status = done_col if tests_passing else test_col
                
                # Link commit and move status if different
                if task.get("commit") != commit.hash or task["status"] != target_status:
                    task["commit"] = commit.hash
                    task["status"] = target_status
                    
                    # Update category (column title)
                    col_title = next((col["title"] for col in config["columns"] if col["id"] == target_status), target_status.capitalize())
                    task["category"] = col_title
                    
                    updated = True
                    if task_id not in updated_tasks:
                        updated_tasks.append(task_id)

    if updated:
        kanban_sync.write_tasks(project.path, tasks)
        # Notify active clients via SSE
        if project_id in project_event_queues:
            for q in project_event_queues[project_id]:
                await q.put({"type": "kanban_update", "message": f"Tasks synced with commits: {', '.join(updated_tasks)}"})

    return {
        "status": "success", 
        "tests_passing": tests_passing, 
        "updated_tasks": updated_tasks
    }

class WBSRequest(BaseModel):
    requirements: str
    model: str = "openai/gpt-4o"

@router.post("/projects/{project_id}/kanban/wbs")
async def generate_wbs(project_id: str, request: WBSRequest, session: AsyncSession = Depends(get_db_session)):
    import json
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    prompt = f"""Eres un Ingeniero de Software Principal y Gestor de Proyectos de gran experiencia. Descompón los siguientes requerimientos de la feature en tareas técnicas atómicas y ordenadas (Work Breakdown Structure - WBS):

Requerimientos:
{request.requirements}

Instrucciones de descomposición:
1. Divide la feature en tareas atómicas independientes (máximo 8 tareas). Cada tarea debe ser lo suficientemente pequeña como para mapear a un commit atómico y funcional.
2. Sugiere un prefijo Conventional Commit para cada tarea (ej. 'feat(auth)', 'fix(api)', 'refactor(core)', 'test(db)', 'docs(readme)').
3. El título de la tarea debe incluir el tipo y la descripción clara.
4. Indica dependencias lógicas: ordena las tareas de modo que las dependencias técnicas vayan primero (ej. backend antes de frontend).
5. Estima el tamaño/tiempo en minutos.
6. Asigna prioridad: 'High', 'Medium', o 'Low'.
7. Proporciona una explicación detallada del orden sugerido para educar al desarrollador en tu razonamiento de dependencias.

Debes responder ÚNICAMENTE con un objeto JSON válido con la siguiente estructura (sin bloques markdown ```json ni texto adicional fuera del JSON):
{{
  "tasks": [
    {{
      "title": "feat(component): add JWT validation middleware",
      "estimated_mins": 45,
      "priority": "High",
      "type": "feat",
      "tags": ["backend", "auth"]
    }}
  ],
  "explanation": "### Razón del orden propuesto\\n\\n1. **Base de Datos/Backend:** Creamos la base lógica primero para establecer el contrato de datos...\\n2. **UI/Integración:** Una vez el contrato del endpoint es estable, procedemos con el maquetado del frontend..."
}}"""

    from app.infrastructure.ai.llm_gateway import LiteLLMGateway
    llm_gateway = LiteLLMGateway()
    
    try:
        response_text = llm_gateway.generate_completion(prompt=prompt, model=request.model)
        
        # Clean response string to extract pure JSON
        clean_res = response_text.strip()
        if clean_res.startswith("```json"):
            clean_res = clean_res[7:]
        elif clean_res.startswith("```"):
            clean_res = clean_res[3:]
            
        if clean_res.endswith("```"):
            clean_res = clean_res[:-3]
            
        clean_res = clean_res.strip()
        
        parsed_wbs = json.loads(clean_res)
        return parsed_wbs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fallo en la planeación IA de la WBS: {str(e)}")

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
    tasks_by_state = {"todo": 0, "in-progress": 0, "done": 0}
    try:
        tasks = kanban_sync.read_tasks(project.path)
        for t in tasks:
            if t["status"] in tasks_by_state:
                tasks_by_state[t["status"]] += 1
    except Exception:
        pass

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
    except Exception:
        pass
        
    try:
        out_branches = await git_gateway._run_command(project.path, 'branch')
        active_branches = len([b for b in out_branches.split('\n') if b.strip()])
    except Exception:
        pass
        
    try:
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
