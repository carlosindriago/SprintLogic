from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.domain.organization import Organization


class OrganizationRepository(ABC):
    @abstractmethod
    def save(self, org: Organization) -> None:
        raise NotImplementedError

    @abstractmethod
    def get_by_id(self, id: UUID) -> Organization | None:
        raise NotImplementedError
