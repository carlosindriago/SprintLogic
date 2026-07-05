from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid4

EMAIL_REGEX = re.compile(r"^[^@]+@[^@]+\.[^@]+$")


@dataclass(frozen=True, slots=True)
class User:
    email: str
    name: str
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def __post_init__(self) -> None:
        if not self.email or not EMAIL_REGEX.match(self.email):
            raise ValueError("Invalid email format")

        if not self.name or not self.name.strip():
            raise ValueError("User name cannot be empty")

        object.__setattr__(self, "email", self.email.strip())
        object.__setattr__(self, "name", self.name.strip())
