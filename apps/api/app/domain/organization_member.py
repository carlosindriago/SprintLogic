from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from uuid import UUID, uuid4


class Role(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


@dataclass(frozen=True, slots=True)
class OrganizationMember:
    organization_id: UUID
    user_id: UUID
    role: Role = Role.MEMBER
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def __post_init__(self) -> None:
        if not isinstance(self.organization_id, UUID):
            raise ValueError("Invalid organization_id")
        if not isinstance(self.user_id, UUID):
            raise ValueError("Invalid user_id")
