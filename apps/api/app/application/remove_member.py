from __future__ import annotations
from uuid import UUID
from app.domain.organization_member import Role
from app.interfaces.organization_repository import OrganizationRepository

class RemoveMember:
    def __init__(self, repository: OrganizationRepository) -> None:
        self._repository = repository

    def __call__(self, *, organization_id: UUID, member_id: UUID) -> None:
        org = self._repository.get_by_id(organization_id)
        if not org:
            raise ValueError("Organization does not exist")
            
        member = self._repository.get_member_by_id(member_id)
        if not member or member.organization_id != organization_id:
            raise ValueError("Member not found in organization")
            
        if member.role == Role.OWNER:
            owners = [m for m in self._repository.get_members(organization_id) if m.role == Role.OWNER]
            if len(owners) <= 1:
                raise ValueError("Cannot remove the only owner of the organization")
                
        self._repository.remove_member(member_id)
