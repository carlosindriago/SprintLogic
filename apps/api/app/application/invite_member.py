from __future__ import annotations
from uuid import UUID
from app.domain.organization_member import OrganizationMember, Role
from app.interfaces.organization_repository import OrganizationRepository

class InviteMember:
    def __init__(self, repository: OrganizationRepository) -> None:
        self._repository = repository

    def __call__(self, *, organization_id: UUID, inviter_id: UUID, invitee_id: UUID, role: Role) -> OrganizationMember:
        org = self._repository.get_by_id(organization_id)
        if not org:
            raise ValueError("Organization does not exist")
            
        if inviter_id == invitee_id:
            raise ValueError("User cannot invite themselves")
            
        member = OrganizationMember(
            organization_id=organization_id,
            user_id=invitee_id,
            role=role,
        )
        self._repository.save_member(member)
        return member
