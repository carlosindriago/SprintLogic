from __future__ import annotations
from uuid import UUID
from app.domain.organization_member import OrganizationMember
from app.interfaces.organization_repository import OrganizationRepository

class ListMembers:
    def __init__(self, repository: OrganizationRepository) -> None:
        self._repository = repository

    def __call__(self, *, organization_id: UUID) -> list[OrganizationMember]:
        return self._repository.get_members(organization_id)
