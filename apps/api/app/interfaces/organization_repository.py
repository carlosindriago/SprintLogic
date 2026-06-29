from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.domain.organization import Organization
from app.domain.organization_member import OrganizationMember


class OrganizationRepository(ABC):
    @abstractmethod
    def save(self, org: Organization) -> None:
        raise NotImplementedError

    @abstractmethod
    def get_by_id(self, id: UUID) -> Organization | None:
        raise NotImplementedError

    @abstractmethod
    def save_member(self, member: OrganizationMember) -> None:
        raise NotImplementedError

    @abstractmethod
    def get_member(self, organization_id: UUID, user_id: UUID) -> OrganizationMember | None:
        raise NotImplementedError

    @abstractmethod
    def get_member_by_id(self, member_id: UUID) -> OrganizationMember | None:
        raise NotImplementedError

    @abstractmethod
    def get_members(self, organization_id: UUID) -> list[OrganizationMember]:
        raise NotImplementedError

    @abstractmethod
    def remove_member(self, member_id: UUID) -> None:
        raise NotImplementedError
