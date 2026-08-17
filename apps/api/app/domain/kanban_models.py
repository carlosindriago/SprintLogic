from enum import StrEnum


class TicketType(StrEnum):
    TECHNICAL_DEBT = "Technical Debt"
    SECURITY = "Security"
    REFACTOR = "Refactor"
    FEATURE = "Feature"


class TicketStatus(StrEnum):
    ICEBOX = "icebox"
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    ARCHIVED = "archived"


class TicketPriority(StrEnum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class EpicStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class SprintStatus(StrEnum):
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"
