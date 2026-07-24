import asyncio
import logging
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.kanban_schemas import (
    KanbanTicketCreate,
    KanbanTicketResponse,
    KanbanTicketUpdate,
)
from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.repositories.kanban_repository import SQLAlchemyKanbanRepository

logger = logging.getLogger(__name__)

async def create_git_branch_for_ticket(project_path: str, ticket: KanbanTicketResponse):
    safe_title = re.sub(r'[^a-zA-Z0-9-]', '-', ticket.title.lower())
    safe_title = re.sub(r'-+', '-', safe_title).strip('-')
    # Use just the first part of UUID to keep branch name shorter
    ticket_id_str = str(ticket.id)[:8]
    branch_name = f"ticket/{ticket_id_str}-{safe_title}"[:50]
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "checkout", "-b", branch_name,
            cwd=project_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()
        logger.info(f"Created git branch {branch_name} in {project_path}")
    except Exception as e:
        logger.error(f"Failed to create git branch {branch_name}: {e}")

router = APIRouter(tags=["kanban"])


@router.get("/projects/{project_id}/kanban/tickets", response_model=list[KanbanTicketResponse])
async def get_project_tickets(
    project_id: str,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project ID format")

    repo = SQLAlchemyKanbanRepository(session)
    return await repo.get_tickets_by_project(project_uuid)


@router.post("/projects/{project_id}/kanban/tickets", response_model=KanbanTicketResponse, status_code=status.HTTP_201_CREATED)
async def create_project_ticket(
    project_id: str,
    payload: KanbanTicketCreate,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project ID format")

    repo = SQLAlchemyKanbanRepository(session)
    ticket = await repo.create_ticket(project_uuid, payload)

    project_repo = SQLAlchemyProjectRepository(session)
    project = await project_repo.get_project(project_uuid)
    if project and project.path:
        asyncio.create_task(create_git_branch_for_ticket(project.path, ticket))

    return ticket


@router.patch("/kanban/tickets/{ticket_id}", response_model=KanbanTicketResponse)
async def update_ticket(
    ticket_id: str,
    payload: KanbanTicketUpdate,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        ticket_uuid = UUID(ticket_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ticket ID format")

    repo = SQLAlchemyKanbanRepository(session)
    updated = await repo.update_ticket(ticket_uuid, payload)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return updated


@router.delete("/kanban/tickets/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticket(
    ticket_id: str,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        ticket_uuid = UUID(ticket_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ticket ID format")

    repo = SQLAlchemyKanbanRepository(session)
    deleted = await repo.delete_ticket(ticket_uuid)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return None
