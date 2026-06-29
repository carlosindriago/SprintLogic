from __future__ import annotations

from uuid import UUID

from app.domain.organization import Organization
from app.domain.organization_member import OrganizationMember, Role
from app.interfaces.organization_repository import OrganizationRepository


class CreateOrganization:
    def __init__(self, repository: OrganizationRepository) -> None:
        self._repository = repository

    def __call__(self, *, name: str, creator_id: UUID) -> Organization:
        organization = Organization(name=name)
        self._repository.save(organization)
        
        member = OrganizationMember(
            organization_id=organization.id,
            user_id=creator_id,
            role=Role.OWNER,
        )
        self._repository.save_member(member)
        
        return organization
