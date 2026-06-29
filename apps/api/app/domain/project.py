from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from uuid import UUID, uuid4


class ProjectStatus(Enum):
    BACKLOG = "BACKLOG"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    ARCHIVED = "ARCHIVED"

    def can_transition_to(self, target: ProjectStatus) -> bool:
        transitions = {
            ProjectStatus.BACKLOG: {ProjectStatus.ACTIVE, ProjectStatus.ARCHIVED},
            ProjectStatus.ACTIVE: {ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED},
            ProjectStatus.COMPLETED: {ProjectStatus.ARCHIVED},
            ProjectStatus.ARCHIVED: set(),
        }
        return target in transitions.get(self, set())


@dataclass(frozen=True, slots=True)
class Project:
    name: str
    slug: str
    organization_id: UUID
    status: ProjectStatus = field(default=ProjectStatus.BACKLOG)
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def __post_init__(self) -> None:
        if not self.name or not self.name.strip():
            raise ValueError("Project name cannot be empty")
            
        if not self.slug or not self.slug.strip():
            raise ValueError("Project slug must be alphanumeric with hyphens")
            
        if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", self.slug):
            raise ValueError("Project slug must be alphanumeric with hyphens")

        object.__setattr__(self, "name", self.name.strip())
        object.__setattr__(self, "slug", self.slug.strip())
