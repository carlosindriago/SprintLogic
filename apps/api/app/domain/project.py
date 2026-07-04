from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid4


@dataclass(frozen=True, slots=True)
class Project:
    name: str
    path: str
    id: UUID = field(default_factory=uuid4)
    last_opened: datetime | None = field(default=None)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def __post_init__(self) -> None:
        if not self.name or not self.name.strip():
            raise ValueError("Project name cannot be empty")

        if not self.path or not self.path.strip():
            raise ValueError("Project path cannot be empty")

        object.__setattr__(self, "name", self.name.strip())
        object.__setattr__(self, "path", self.path.strip())
