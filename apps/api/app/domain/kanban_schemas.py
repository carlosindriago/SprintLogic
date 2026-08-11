from datetime import datetime
from uuid import UUID
from typing import List

from pydantic import BaseModel, ConfigDict

from app.domain.kanban_models import TicketPriority, TicketStatus, TicketType


class TicketNodeLink(BaseModel):
    node_id: str
    file_path: str | None = None

    model_config = ConfigDict(from_attributes=True)


class KanbanTicketCreate(BaseModel):
    title: str
    type: TicketType = TicketType.TECHNICAL_DEBT
    priority: TicketPriority = TicketPriority.MEDIUM
    description: str
    report_id: UUID | None = None
    affected_nodes: list[TicketNodeLink] = []
    branch_name: str | None = None
    epic: str | None = None
    sprint: str | None = None
    subtasks: list[dict] = []


class KanbanTicketUpdate(BaseModel):
    title: str | None = None
    type: TicketType | None = None
    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    description: str | None = None
    branch_name: str | None = None
    epic: str | None = None
    sprint: str | None = None
    subtasks: list[dict] | None = None


class KanbanTicketResponse(BaseModel):
    id: UUID
    project_id: UUID
    report_id: UUID | None = None
    title: str
    type: TicketType
    status: TicketStatus
    priority: TicketPriority
    description: str
    branch_name: str | None = None
    epic: str | None = None
    sprint: str | None = None
    subtasks: list['KanbanTicketResponse'] = []
    created_at: datetime
    updated_at: datetime
    affected_nodes: list[TicketNodeLink] = []

    model_config = ConfigDict(from_attributes=True)


class KanbanTicketPatch(BaseModel):
    file_path: str
    search_content: str
    replace_content: str
