import asyncio
import logging
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.patch_engine import apply_patch
from app.domain.kanban_schemas import (
    EpicCreate,
    EpicResponse,
    EpicUpdate,
    KanbanTicketCreate,
    KanbanTicketPatch,
    KanbanTicketResponse,
    KanbanTicketUpdate,
    SprintCreate,
    SprintResponse,
    SprintUpdate,
    WBSImportTicket,
)
from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.models import GraphNodeModel
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.repositories.kanban_repository import SQLAlchemyKanbanRepository

logger = logging.getLogger(__name__)


async def create_git_branch_for_ticket(project_path: str, ticket: KanbanTicketResponse):
    safe_title = re.sub(r"[^a-zA-Z0-9-]", "-", ticket.title.lower())
    safe_title = re.sub(r"-+", "-", safe_title).strip("-")
    # Use just the first part of UUID to keep branch name shorter
    ticket_id_str = str(ticket.id)[:8]
    branch_name = f"ticket/{ticket_id_str}-{safe_title}"[:50]
    try:
        proc = await asyncio.create_subprocess_exec(
            "git",
            "checkout",
            "-b",
            branch_name,
            cwd=project_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project ID format"
        )

    repo = SQLAlchemyKanbanRepository(session)
    return await repo.get_tickets_by_project(project_uuid)


@router.post(
    "/projects/{project_id}/kanban/tickets",
    response_model=KanbanTicketResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_ticket(
    project_id: str,
    payload: KanbanTicketCreate,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project ID format"
        )

    repo = SQLAlchemyKanbanRepository(session)
    ticket = await repo.create_ticket(project_uuid, payload)

    project_repo = SQLAlchemyProjectRepository(session)
    project = await project_repo.get_project(project_uuid)
    if project and project.path:
        asyncio.create_task(create_git_branch_for_ticket(project.path, ticket))

    return ticket


@router.post(
    "/projects/{project_id}/kanban/wbs-import",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
)
async def import_wbs_tickets(
    project_id: str,
    payload: list[WBSImportTicket],
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project ID format"
        )

    repo = SQLAlchemyKanbanRepository(session)
    count = await repo.bulk_import_wbs(project_uuid, payload)

    return {"success": True, "imported_count": count}


@router.get("/kanban/tickets/{ticket_id}", response_model=KanbanTicketResponse)
async def get_ticket(ticket_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        ticket_uuid = UUID(ticket_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ticket ID format"
        )

    repo = SQLAlchemyKanbanRepository(session)
    ticket = await repo.get_ticket(ticket_uuid)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ticket ID format"
        )

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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ticket ID format"
        )

    repo = SQLAlchemyKanbanRepository(session)
    deleted = await repo.delete_ticket(ticket_uuid)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return None


from sqlalchemy import or_, select


@router.get("/tickets/{ticket_id}/context")
async def get_ticket_context(ticket_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        ticket_uuid = UUID(ticket_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ticket ID format"
        )

    repo = SQLAlchemyKanbanRepository(session)
    ticket = await repo.get_ticket(ticket_uuid)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    context_files = set()

    # 1. Affected nodes directly linked
    for node in ticket.affected_nodes:
        if node.file_path:
            context_files.add(node.file_path)

    # 2. Query GraphNodeModel heuristic (title/description keywords)
    # Using simplistic keywords heuristic if not enough files
    if len(context_files) < 3:
        keywords = set(re.findall(r"\b\w{4,}\b", ticket.title.lower()))
        # limit keywords to prevent huge OR query
        keyword_list = list(keywords)[:5]

        if keyword_list:
            conditions = [GraphNodeModel.file_path.ilike(f"%{kw}%") for kw in keyword_list]
            query = (
                select(GraphNodeModel.file_path)
                .where(GraphNodeModel.project_id == ticket.project_id, or_(*conditions))
                .limit(5)
            )

            result = await session.execute(query)
            heuristic_files = result.scalars().all()
            for hf in heuristic_files:
                context_files.add(hf)

    return {"context_files": list(context_files)[:5]}


@router.post("/tickets/{ticket_id}/apply_patch")
async def apply_ticket_patch(
    ticket_id: str, payload: KanbanTicketPatch, session: AsyncSession = Depends(get_db_session)
):
    try:
        ticket_uuid = UUID(ticket_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ticket ID format"
        )

    repo = SQLAlchemyKanbanRepository(session)
    ticket = await repo.get_ticket(ticket_uuid)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    project_repo = SQLAlchemyProjectRepository(session)
    project = await project_repo.get_by_id(ticket.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        success = apply_patch(
            project.path, payload.file_path, payload.search_content, payload.replace_content
        )
        return {"success": success}
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid patch format")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        logger.error("Failed to apply patch: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")


@router.get("/projects/{project_id}/epics", response_model=list[EpicResponse])
async def get_project_epics(
    project_id: str,
    include_archived: bool = False,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project ID format"
        )
    repo = SQLAlchemyKanbanRepository(session)
    return await repo.get_epics_by_project(project_uuid, include_archived)


@router.post(
    "/projects/{project_id}/epics", response_model=EpicResponse, status_code=status.HTTP_201_CREATED
)
async def create_project_epic(
    project_id: str,
    payload: EpicCreate,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project ID format"
        )
    repo = SQLAlchemyKanbanRepository(session)
    return await repo.create_epic(project_uuid, payload)


@router.patch("/epics/{epic_id}", response_model=EpicResponse)
async def update_epic_endpoint(
    epic_id: str,
    payload: EpicUpdate,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        epic_uuid = UUID(epic_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid epic ID format"
        )
    repo = SQLAlchemyKanbanRepository(session)
    updated = await repo.update_epic(epic_uuid, payload)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Epic not found")
    return updated


@router.post("/epics/{epic_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
async def archive_epic_endpoint(
    epic_id: str,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        epic_uuid = UUID(epic_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid epic ID format"
        )
    repo = SQLAlchemyKanbanRepository(session)
    archived = await repo.archive_epic(epic_uuid)
    if not archived:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Epic not found")
    return None


@router.get("/projects/{project_id}/sprints", response_model=list[SprintResponse])
async def get_project_sprints(
    project_id: str,
    include_archived: bool = False,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project ID format"
        )
    repo = SQLAlchemyKanbanRepository(session)
    return await repo.get_sprints_by_project(project_uuid, include_archived)


@router.post(
    "/projects/{project_id}/sprints",
    response_model=SprintResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_sprint(
    project_id: str,
    payload: SprintCreate,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project ID format"
        )
    repo = SQLAlchemyKanbanRepository(session)
    return await repo.create_sprint(project_uuid, payload)


@router.patch("/sprints/{sprint_id}", response_model=SprintResponse)
async def update_sprint_endpoint(
    sprint_id: str,
    payload: SprintUpdate,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        sprint_uuid = UUID(sprint_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid sprint ID format"
        )
    repo = SQLAlchemyKanbanRepository(session)
    updated = await repo.update_sprint(sprint_uuid, payload)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")
    return updated


@router.post("/sprints/{sprint_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
async def archive_sprint_endpoint(
    sprint_id: str,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        sprint_uuid = UUID(sprint_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid sprint ID format"
        )
    repo = SQLAlchemyKanbanRepository(session)
    archived = await repo.archive_sprint(sprint_uuid)
    if not archived:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not found")
    return None
