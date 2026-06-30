from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.git.git_gateway import LocalGitGateway

router = APIRouter()
git_gateway = LocalGitGateway()


class GitActionRequest(BaseModel):
    action: str
    message: str = ""


@router.get("/{project_id}/git/status")
async def get_git_status(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    status = await git_gateway.get_status(project.path)
    if "error" in status:
        raise HTTPException(status_code=500, detail=status["error"])

    return status


@router.get("/{project_id}/git/log")
async def get_git_log(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    commits = await git_gateway.get_recent_commits(project.path, limit=50)
    return {"commits": commits}


@router.post("/{project_id}/git/action")
async def execute_git_action(
    project_id: str,
    request: GitActionRequest,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await git_gateway.execute_action(project.path, request.action, request.message)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message"))

    return result
