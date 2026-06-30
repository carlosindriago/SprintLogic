from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, List
import sqlite3
import os

from app.infrastructure.git.git_gateway import LocalGitGateway
from app.infrastructure.database.sqlite_repository import SQLiteProjectRepository

router = APIRouter()
git_gateway = LocalGitGateway()
repo = SQLiteProjectRepository()

class GitActionRequest(BaseModel):
    action: str
    message: str = ""

@router.get("/{project_id}/git/status")
async def get_git_status(project_id: str):
    project = repo.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    status = await git_gateway.get_status(project.path)
    if "error" in status:
        raise HTTPException(status_code=500, detail=status["error"])
    return status

@router.get("/{project_id}/git/log")
async def get_git_log(project_id: str):
    project = repo.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    commits = await git_gateway.get_recent_commits(project.path, limit=50)
    return {"commits": commits}

@router.post("/{project_id}/git/action")
async def execute_git_action(project_id: str, request: GitActionRequest):
    project = repo.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    result = await git_gateway.execute_action(project.path, request.action, request.message)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message"))
    
    return result
