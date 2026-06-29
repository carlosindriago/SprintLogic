from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any

from app.infrastructure.db.database import get_db_session
from app.infrastructure.git.git_gateway import LocalGitGateway
from app.infrastructure.db.git_repository import SQLAlchemyGitRepoRepository
from app.infrastructure.repositories.graph_repository import SQLAlchemyGraphRepository
from app.infrastructure.parser.ast_parser import ASTParserService
from app.application.scan_repo import ScanLocalRepository
from app.application.scan_codebase import ScanCodebaseUseCase

router = APIRouter()

class ScanRequest(BaseModel):
    path: str

@router.post("/projects/scan")
async def scan_project(request: ScanRequest, session: AsyncSession = Depends(get_db_session)):
    git_gateway = LocalGitGateway()
    git_repo = SQLAlchemyGitRepoRepository(session)
    scan_repo_usecase = ScanLocalRepository(git_gateway, git_repo)
    
    try:
        saved_repo = await scan_repo_usecase.execute(request.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    parser = ASTParserService()
    graph_repo = SQLAlchemyGraphRepository(session)
    scan_codebase_usecase = ScanCodebaseUseCase(parser, graph_repo)
    
    await scan_codebase_usecase.execute(request.path)
    
    return {"project_id": saved_repo.id}

@router.get("/projects/{project_id}/graph")
async def get_project_graph(project_id: int, session: AsyncSession = Depends(get_db_session)):
    graph_repo = SQLAlchemyGraphRepository(session)
    nodes = await graph_repo.get_all_nodes()
    edges = await graph_repo.get_all_edges()
    
    nodes_dict = [
        {
            "id": n.id,
            "label": n.label.value if hasattr(n.label, 'value') else n.label,
            "name": n.name,
            "file_path": n.file_path
        }
        for n in nodes
    ]
    
    links_dict = [
        {
            "source": e.source_id,
            "target": e.target_id,
            "type": e.type.value if hasattr(e.type, 'value') else e.type
        }
        for e in edges
    ]
    
    return {"nodes": nodes_dict, "links": links_dict}

@router.get("/projects/file")
async def get_file_content(path: str):
    import os
    if not os.path.exists(path) or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
