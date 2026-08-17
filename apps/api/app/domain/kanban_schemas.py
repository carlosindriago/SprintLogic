from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.domain.kanban_models import (
    EpicStatus,
    SprintStatus,
    TicketPriority,
    TicketStatus,
    TicketType,
)


class TicketNodeLink(BaseModel):
    node_id: str
    file_path: str | None = None

    model_config = ConfigDict(from_attributes=True)


class KanbanTicketCreate(BaseModel):
    title: str
    type: TicketType = TicketType.TECHNICAL_DEBT
    status: TicketStatus = TicketStatus.TODO
    priority: TicketPriority = TicketPriority.MEDIUM
    description: str
    report_id: UUID | None = None
    affected_nodes: list[TicketNodeLink] = []
    branch_name: str | None = None
    epic_id: UUID | None = None
    sprint_id: UUID | None = None
    subtasks: list[dict] = []


class SecurityTicketHandoffRequest(BaseModel):
    finding_id: str
    title: str
    description: str
    severity: str = "medium"
    file_path: str
    line_number: int = 1
    cwe: str | None = None
    rule_id: str | None = None
    mitigation_diff: str | None = None
    subtasks: list[dict] = []
    affected_nodes: list[str] = []


class KanbanTicketUpdate(BaseModel):
    title: str | None = None
    type: TicketType | None = None
    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    description: str | None = None
    branch_name: str | None = None
    epic_id: UUID | None = None
    sprint_id: UUID | None = None
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
    epic_id: UUID | None = None
    sprint_id: UUID | None = None
    subtasks: list[dict] = []
    created_at: datetime
    updated_at: datetime
    affected_nodes: list[TicketNodeLink] = []

    model_config = ConfigDict(from_attributes=True)


class WBSImportTicket(BaseModel):
    title: str
    type: TicketType = TicketType.FEATURE
    priority: TicketPriority = TicketPriority.MEDIUM
    description: str
    report_id: UUID | None = None
    affected_nodes: list[TicketNodeLink] = []
    branch_name: str | None = None
    epic: str | None = None
    sprint: str | None = None
    subtasks: list[dict] = []

    @field_validator("type", mode="before")
    @classmethod
    def coerce_type(cls, v: object) -> TicketType:
        """Map arbitrary strings from the WBS Markdown parser to valid TicketType values."""
        if isinstance(v, TicketType):
            return v
        mapping: dict[str, TicketType] = {
            "feature": TicketType.FEATURE,
            "security": TicketType.SECURITY,
            "refactor": TicketType.REFACTOR,
            "technical debt": TicketType.TECHNICAL_DEBT,
            "debt": TicketType.TECHNICAL_DEBT,
            "bug": TicketType.REFACTOR,
            "fix": TicketType.REFACTOR,
            "task": TicketType.FEATURE,
            "user story": TicketType.FEATURE,
            "improvement": TicketType.FEATURE,
            "chore": TicketType.TECHNICAL_DEBT,
        }
        return mapping.get(str(v).lower(), TicketType.FEATURE)

    @field_validator("priority", mode="before")
    @classmethod
    def coerce_priority(cls, v: object) -> TicketPriority:
        """Map arbitrary priority strings to valid TicketPriority values."""
        if isinstance(v, TicketPriority):
            return v
        mapping: dict[str, TicketPriority] = {
            "high": TicketPriority.HIGH,
            "critical": TicketPriority.HIGH,
            "urgent": TicketPriority.HIGH,
            "medium": TicketPriority.MEDIUM,
            "normal": TicketPriority.MEDIUM,
            "low": TicketPriority.LOW,
            "minor": TicketPriority.LOW,
        }
        return mapping.get(str(v).lower(), TicketPriority.MEDIUM)


class KanbanTicketPatch(BaseModel):
    file_path: str
    search_content: str
    replace_content: str


class EpicCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "bg-blue-500"


class EpicUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None


class EpicResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    description: str
    color: str
    status: EpicStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


from pydantic import model_validator


class SprintCreate(BaseModel):
    name: str
    goal: str = ""
    start_date: datetime
    end_date: datetime

    @model_validator(mode="after")
    def validate_dates(self) -> "SprintCreate":
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be strictly greater than start_date")
        return self


class SprintUpdate(BaseModel):
    name: str | None = None
    goal: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> "SprintUpdate":
        # Only validate if both are provided (if one is updated we'd need db context to validate accurately, but let's do a basic check)
        if self.start_date and self.end_date and self.end_date <= self.start_date:
            raise ValueError("end_date must be strictly greater than start_date")
        return self


class SprintResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    goal: str
    start_date: datetime
    end_date: datetime
    status: SprintStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
