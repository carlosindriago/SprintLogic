import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.kanban_models import TicketStatus
from app.domain.kanban_schemas import (
    KanbanTicketCreate,
    KanbanTicketResponse,
    KanbanTicketUpdate,
    TicketNodeLink,
)
from app.infrastructure.db.models import KanbanTicketModel, KanbanTicketNodeModel


class SQLAlchemyKanbanRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_ticket(self, project_id: UUID, payload: KanbanTicketCreate) -> KanbanTicketResponse:
        ticket_id = uuid.uuid4()
        now = datetime.utcnow()
        ticket_model = KanbanTicketModel(
            id=ticket_id,
            project_id=project_id,
            report_id=payload.report_id,
            title=payload.title,
            type=payload.type,
            status=TicketStatus.TODO,
            priority=payload.priority,
            description=payload.description,
            created_at=now,
            updated_at=now,
        )
        self.session.add(ticket_model)

        node_links: list[TicketNodeLink] = []
        for node_link in payload.affected_nodes:
            node_model = KanbanTicketNodeModel(
                ticket_id=ticket_id,
                node_id=node_link.node_id,
                file_path=node_link.file_path,
            )
            self.session.add(node_model)
            node_links.append(node_link)

        await self.session.commit()

        return KanbanTicketResponse(
            id=ticket_id,
            project_id=project_id,
            report_id=payload.report_id,
            title=payload.title,
            type=payload.type,
            status=TicketStatus.TODO,
            priority=payload.priority,
            description=payload.description,
            created_at=now,
            updated_at=now,
            affected_nodes=node_links,
        )

    async def get_ticket(self, ticket_id: UUID) -> KanbanTicketResponse | None:
        query = select(KanbanTicketModel).where(KanbanTicketModel.id == ticket_id)
        result = await self.session.execute(query)
        ticket = result.scalar_one_or_none()
        if not ticket:
            return None

        node_query = select(KanbanTicketNodeModel).where(KanbanTicketNodeModel.ticket_id == ticket.id)
        nodes_res = await self.session.execute(node_query)
        nodes = nodes_res.scalars().all()
        links = [TicketNodeLink(node_id=n.node_id, file_path=n.file_path) for n in nodes]

        return KanbanTicketResponse(
            id=ticket.id,
            project_id=ticket.project_id,
            report_id=ticket.report_id,
            title=ticket.title,
            type=ticket.type,
            status=ticket.status,
            priority=ticket.priority,
            description=ticket.description,
            created_at=ticket.created_at,
            updated_at=ticket.updated_at,
            affected_nodes=links,
        )

    async def get_tickets_by_project(self, project_id: UUID) -> list[KanbanTicketResponse]:
        query = (
            select(KanbanTicketModel)
            .where(KanbanTicketModel.project_id == project_id)
            .order_by(KanbanTicketModel.created_at.desc())
        )
        result = await self.session.execute(query)
        tickets = result.scalars().all()

        response_list: list[KanbanTicketResponse] = []
        for t in tickets:
            node_query = select(KanbanTicketNodeModel).where(KanbanTicketNodeModel.ticket_id == t.id)
            nodes_res = await self.session.execute(node_query)
            nodes = nodes_res.scalars().all()
            links = [TicketNodeLink(node_id=n.node_id, file_path=n.file_path) for n in nodes]
            response_list.append(
                KanbanTicketResponse(
                    id=t.id,
                    project_id=t.project_id,
                    report_id=t.report_id,
                    title=t.title,
                    type=t.type,
                    status=t.status,
                    priority=t.priority,
                    description=t.description,
                    created_at=t.created_at,
                    updated_at=t.updated_at,
                    affected_nodes=links,
                )
            )

        return response_list

    async def update_ticket(self, ticket_id: UUID, payload: KanbanTicketUpdate) -> KanbanTicketResponse | None:
        query = select(KanbanTicketModel).where(KanbanTicketModel.id == ticket_id)
        result = await self.session.execute(query)
        ticket = result.scalar_one_or_none()
        if not ticket:
            return None

        if payload.title is not None:
            ticket.title = payload.title
        if payload.type is not None:
            ticket.type = payload.type
        if payload.status is not None:
            ticket.status = payload.status
        if payload.priority is not None:
            ticket.priority = payload.priority
        if payload.description is not None:
            ticket.description = payload.description

        ticket.updated_at = datetime.utcnow()
        await self.session.commit()

        node_query = select(KanbanTicketNodeModel).where(KanbanTicketNodeModel.ticket_id == ticket.id)
        nodes_res = await self.session.execute(node_query)
        nodes = nodes_res.scalars().all()
        links = [TicketNodeLink(node_id=n.node_id, file_path=n.file_path) for n in nodes]

        # Get subtasks for this ticket
        subtask_query = select(KanbanTicketModel).where(KanbanTicketModel.parent_id == ticket.id)
        subtasks_res = await self.session.execute(subtask_query)
        subtasks = subtasks_res.scalars().all()
        
        # Convert subtasks to KanbanTicketResponse (simplified for now)
        subtask_responses = [
            KanbanTicketResponse(
                id=subtask.id,
                project_id=subtask.project_id,
                report_id=subtask.report_id,
                title=subtask.title,
                type=subtask.type,
                status=subtask.status,
                priority=subtask.priority,
                description=subtask.description,
                branch_name=subtask.branch_name,
                epic=subtask.epic,
                sprint=subtask.sprint,
                subtasks=[],  # Nested subtasks not handled in this recursion
                created_at=subtask.created_at,
                updated_at=subtask.updated_at,
                affected_nodes=[],  # Will need to be populated if needed
            ) for subtask in subtasks
        ]

        return KanbanTicketResponse(
            id=ticket.id,
            project_id=ticket.project_id,
            report_id=ticket.report_id,
            title=ticket.title,
            type=ticket.type,
            status=ticket.status,
            priority=ticket.priority,
            description=ticket.description,
            branch_name=ticket.branch_name,
            epic=ticket.epic,
            sprint=ticket.sprint,
            subtasks=subtask_responses,
            created_at=ticket.created_at,
            updated_at=ticket.updated_at,
            affected_nodes=links,
        )

    async def delete_ticket(self, ticket_id: UUID) -> bool:
        query = select(KanbanTicketModel).where(KanbanTicketModel.id == ticket_id)
        result = await self.session.execute(query)
        ticket = result.scalar_one_or_none()
        if not ticket:
            return False

        await self.session.execute(delete(KanbanTicketNodeModel).where(KanbanTicketNodeModel.ticket_id == ticket_id))
        await self.session.execute(delete(KanbanTicketModel).where(KanbanTicketModel.id == ticket_id))
        await self.session.commit()
        return True
