import uuid
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.kanban_models import TicketStatus
from app.domain.kanban_schemas import (
    EpicCreate,
    EpicResponse,
    EpicUpdate,
    KanbanTicketCreate,
    KanbanTicketResponse,
    KanbanTicketUpdate,
    SprintCreate,
    SprintResponse,
    SprintUpdate,
    TicketNodeLink,
    WBSImportTicket,
)
from app.infrastructure.db.models import (
    EpicModel,
    KanbanTicketModel,
    KanbanTicketNodeModel,
    SprintModel,
)


class SQLAlchemyKanbanRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def bulk_import_wbs(self, project_id: UUID, tickets: list[WBSImportTicket]) -> int:
        now = datetime.now(UTC)
        import datetime as dt

        epic_names = {t.epic.strip() for t in tickets if t.epic and t.epic.strip()}
        sprint_names = {t.sprint.strip() for t in tickets if t.sprint and t.sprint.strip()}

        # Map name to UUID
        epic_map: dict[str, UUID] = {}
        sprint_map: dict[str, UUID] = {}

        # Epics
        if epic_names:
            from sqlalchemy import func

            query = select(EpicModel).where(
                EpicModel.project_id == project_id,
                func.lower(EpicModel.name).in_([n.lower() for n in epic_names]),
            )
            res = await self.session.execute(query)
            existing_epics = res.scalars().all()
            for e in existing_epics:
                epic_map[e.name.lower()] = e.id

            for name in epic_names:
                if name.lower() not in epic_map:
                    new_epic_id = uuid.uuid4()
                    new_epic = EpicModel(
                        id=new_epic_id,
                        project_id=project_id,
                        name=name,
                        description="",
                        color="bg-blue-500",
                        created_at=now,
                        updated_at=now,
                    )
                    self.session.add(new_epic)
                    epic_map[name.lower()] = new_epic_id

        # Sprints
        if sprint_names:
            from sqlalchemy import func

            sprint_query = select(SprintModel).where(
                SprintModel.project_id == project_id,
                func.lower(SprintModel.name).in_([n.lower() for n in sprint_names]),
            )
            res = await self.session.execute(sprint_query)
            existing_sprints = res.scalars().all()
            for s in existing_sprints:
                sprint_map[s.name.lower()] = s.id

            for name in sprint_names:
                if name.lower() not in sprint_map:
                    new_sprint_id = uuid.uuid4()
                    new_sprint = SprintModel(
                        id=new_sprint_id,
                        project_id=project_id,
                        name=name,
                        goal="",
                        start_date=now,
                        end_date=now + dt.timedelta(days=14),
                        created_at=now,
                        updated_at=now,
                    )
                    self.session.add(new_sprint)
                    sprint_map[name.lower()] = new_sprint_id

        ticket_models = []
        node_models = []

        for payload in tickets:
            ticket_id = uuid.uuid4()
            eid = (
                epic_map.get(payload.epic.strip().lower())
                if payload.epic and payload.epic.strip()
                else None
            )
            sid = (
                sprint_map.get(payload.sprint.strip().lower())
                if payload.sprint and payload.sprint.strip()
                else None
            )

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
                branch_name=payload.branch_name,
                epic_id=eid,
                sprint_id=sid,
                subtasks=payload.subtasks,
            )
            ticket_models.append(ticket_model)

            for node_link in payload.affected_nodes:
                node_models.append(
                    KanbanTicketNodeModel(
                        ticket_id=ticket_id,
                        node_id=node_link.node_id,
                        file_path=node_link.file_path,
                    )
                )

        self.session.add_all(ticket_models)
        self.session.add_all(node_models)
        await self.session.commit()

        return len(ticket_models)

    async def create_ticket(
        self, project_id: UUID, payload: KanbanTicketCreate
    ) -> KanbanTicketResponse:
        ticket_id = uuid.uuid4()
        now = datetime.now(UTC)
        ticket_model = KanbanTicketModel(
            id=ticket_id,
            project_id=project_id,
            report_id=payload.report_id,
            title=payload.title,
            type=payload.type,
            status=payload.status or TicketStatus.TODO,
            priority=payload.priority,
            description=payload.description,
            created_at=now,
            updated_at=now,
            branch_name=payload.branch_name,
            epic_id=payload.epic_id,
            sprint_id=payload.sprint_id,
            subtasks=payload.subtasks,
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
            branch_name=payload.branch_name,
            epic_id=payload.epic_id,
            sprint_id=payload.sprint_id,
            subtasks=payload.subtasks,
            affected_nodes=node_links,
        )

    async def get_ticket(self, ticket_id: UUID) -> KanbanTicketResponse | None:
        query = select(KanbanTicketModel).where(KanbanTicketModel.id == ticket_id)
        result = await self.session.execute(query)
        ticket = result.scalar_one_or_none()
        if not ticket:
            return None

        node_query = select(KanbanTicketNodeModel).where(
            KanbanTicketNodeModel.ticket_id == ticket.id
        )
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
            branch_name=ticket.branch_name,
            epic_id=ticket.epic_id,
            sprint_id=ticket.sprint_id,
            subtasks=list(ticket.subtasks) if isinstance(ticket.subtasks, list) else [],
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

        ticket_ids = [t.id for t in tickets]
        nodes_by_ticket: dict[UUID, list[TicketNodeLink]] = {}

        if ticket_ids:
            nodes_query = select(KanbanTicketNodeModel).where(
                KanbanTicketNodeModel.ticket_id.in_(ticket_ids)
            )
            nodes_res = await self.session.execute(nodes_query)
            all_nodes = nodes_res.scalars().all()

            for n in all_nodes:
                if n.ticket_id not in nodes_by_ticket:
                    nodes_by_ticket[n.ticket_id] = []
                nodes_by_ticket[n.ticket_id].append(
                    TicketNodeLink(node_id=n.node_id, file_path=n.file_path)
                )

        response_list: list[KanbanTicketResponse] = []
        for t in tickets:
            links = nodes_by_ticket.get(t.id, [])
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
                    branch_name=t.branch_name,
                    epic_id=t.epic_id,
                    sprint_id=t.sprint_id,
                    subtasks=list(t.subtasks) if isinstance(t.subtasks, list) else [],
                    affected_nodes=links,
                )
            )

        return response_list

    async def update_ticket(
        self, ticket_id: UUID, payload: KanbanTicketUpdate
    ) -> KanbanTicketResponse | None:
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
        if payload.branch_name is not None:
            ticket.branch_name = payload.branch_name
        if hasattr(payload, "epic_id") and payload.epic_id is not None:
            ticket.epic_id = payload.epic_id
        if hasattr(payload, "sprint_id") and payload.sprint_id is not None:
            ticket.sprint_id = payload.sprint_id
        if payload.subtasks is not None:
            ticket.subtasks = payload.subtasks

        ticket.updated_at = datetime.now(UTC)
        await self.session.commit()

        node_query = select(KanbanTicketNodeModel).where(
            KanbanTicketNodeModel.ticket_id == ticket.id
        )
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
            branch_name=ticket.branch_name,
            epic_id=ticket.epic_id,
            sprint_id=ticket.sprint_id,
            subtasks=list(ticket.subtasks) if isinstance(ticket.subtasks, list) else [],
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

        await self.session.execute(
            delete(KanbanTicketNodeModel).where(KanbanTicketNodeModel.ticket_id == ticket_id)
        )
        await self.session.execute(
            delete(KanbanTicketModel).where(KanbanTicketModel.id == ticket_id)
        )
        await self.session.commit()
        return True

    # --- Epics ---
    async def create_epic(self, project_id: UUID, payload: EpicCreate) -> EpicResponse:
        epic_id = uuid.uuid4()
        now = datetime.now(UTC)
        epic_model = EpicModel(
            id=epic_id,
            project_id=project_id,
            name=payload.name,
            description=payload.description,
            color=payload.color,
            created_at=now,
            updated_at=now,
        )
        self.session.add(epic_model)
        await self.session.commit()
        return EpicResponse.model_validate(epic_model)

    async def get_epics_by_project(
        self, project_id: UUID, include_archived: bool = False
    ) -> list[EpicResponse]:
        from app.domain.kanban_models import EpicStatus

        query = select(EpicModel).where(EpicModel.project_id == project_id)
        if not include_archived:
            query = query.where(EpicModel.status != EpicStatus.ARCHIVED)
        query = query.order_by(EpicModel.created_at.desc())

        result = await self.session.execute(query)
        epics = result.scalars().all()
        return [EpicResponse.model_validate(e) for e in epics]

    async def update_epic(self, epic_id: UUID, payload: EpicUpdate) -> EpicResponse | None:
        query = select(EpicModel).where(EpicModel.id == epic_id)
        result = await self.session.execute(query)
        epic = result.scalar_one_or_none()
        if not epic:
            return None

        if payload.name is not None:
            epic.name = payload.name
        if payload.description is not None:
            epic.description = payload.description
        if payload.color is not None:
            epic.color = payload.color

        epic.updated_at = datetime.now(UTC)
        await self.session.commit()
        return EpicResponse.model_validate(epic)

    async def archive_epic(self, epic_id: UUID) -> bool:
        from app.domain.kanban_models import EpicStatus

        query = select(EpicModel).where(EpicModel.id == epic_id)
        result = await self.session.execute(query)
        epic = result.scalar_one_or_none()
        if not epic:
            return False

        epic.status = EpicStatus.ARCHIVED
        epic.updated_at = datetime.now(UTC)
        await self.session.commit()
        return True

    # --- Sprints ---
    async def create_sprint(self, project_id: UUID, payload: SprintCreate) -> SprintResponse:
        sprint_id = uuid.uuid4()
        now = datetime.now(UTC)
        sprint_model = SprintModel(
            id=sprint_id,
            project_id=project_id,
            name=payload.name,
            goal=payload.goal,
            start_date=payload.start_date,
            end_date=payload.end_date,
            created_at=now,
            updated_at=now,
        )
        self.session.add(sprint_model)
        await self.session.commit()
        return SprintResponse.model_validate(sprint_model)

    async def get_sprints_by_project(
        self, project_id: UUID, include_archived: bool = False
    ) -> list[SprintResponse]:
        from app.domain.kanban_models import SprintStatus

        query = select(SprintModel).where(SprintModel.project_id == project_id)
        if not include_archived:
            query = query.where(SprintModel.status != SprintStatus.ARCHIVED)
        query = query.order_by(SprintModel.created_at.desc())

        result = await self.session.execute(query)
        sprints = result.scalars().all()
        return [SprintResponse.model_validate(s) for s in sprints]

    async def update_sprint(self, sprint_id: UUID, payload: SprintUpdate) -> SprintResponse | None:
        query = select(SprintModel).where(SprintModel.id == sprint_id)
        result = await self.session.execute(query)
        sprint = result.scalar_one_or_none()
        if not sprint:
            return None

        if payload.name is not None:
            sprint.name = payload.name
        if payload.goal is not None:
            sprint.goal = payload.goal
        if payload.start_date is not None:
            sprint.start_date = payload.start_date
        if payload.end_date is not None:
            sprint.end_date = payload.end_date

        sprint.updated_at = datetime.now(UTC)
        await self.session.commit()
        return SprintResponse.model_validate(sprint)

    async def archive_sprint(self, sprint_id: UUID) -> bool:
        from app.domain.kanban_models import SprintStatus

        query = select(SprintModel).where(SprintModel.id == sprint_id)
        result = await self.session.execute(query)
        sprint = result.scalar_one_or_none()
        if not sprint:
            return False

        sprint.status = SprintStatus.ARCHIVED
        sprint.updated_at = datetime.now(UTC)
        await self.session.commit()
        return True
