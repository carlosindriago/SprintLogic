from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.application.create_organization import CreateOrganization
from app.application.invite_member import InviteMember
from app.application.list_members import ListMembers
from app.infrastructure.db.database import get_db_session
from app.infrastructure.repositories.sqlalchemy_organization_repository import (
    SQLAlchemyOrganizationRepository,
)
from app.interfaces.organization_repository import OrganizationRepository
from app.domain.user import User
from app.domain.organization_member import Role
from app.interfaces.api.dependencies import get_current_user

router = APIRouter(prefix="/organizations", tags=["organizations"])


class OrganizationCreateRequest(BaseModel):
    name: str


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime


class InviteMemberRequest(BaseModel):
    invitee_id: UUID
    role: Role


class OrganizationMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    user_id: UUID
    role: Role
    created_at: datetime


async def get_organization_repository(
    session: Session = Depends(get_db_session),
) -> OrganizationRepository:
    return SQLAlchemyOrganizationRepository(session)


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    request: OrganizationCreateRequest,
    repository: OrganizationRepository = Depends(get_organization_repository),
    current_user: User = Depends(get_current_user),
) -> OrganizationResponse:
    use_case = CreateOrganization(repository)
    organization = use_case(name=request.name, creator_id=current_user.id)

    return OrganizationResponse.model_validate(organization)


@router.post("/{organization_id}/members", response_model=OrganizationMemberResponse, status_code=status.HTTP_201_CREATED)
async def invite_member(
    organization_id: UUID,
    request: InviteMemberRequest,
    repository: OrganizationRepository = Depends(get_organization_repository),
    current_user: User = Depends(get_current_user),
) -> OrganizationMemberResponse:
    use_case = InviteMember(repository)
    member = use_case(
        organization_id=organization_id,
        inviter_id=current_user.id,
        invitee_id=request.invitee_id,
        role=request.role
    )
    return OrganizationMemberResponse.model_validate(member)


@router.get("/{organization_id}/members", response_model=list[OrganizationMemberResponse])
async def list_members(
    organization_id: UUID,
    repository: OrganizationRepository = Depends(get_organization_repository),
    current_user: User = Depends(get_current_user),
) -> list[OrganizationMemberResponse]:
    use_case = ListMembers(repository)
    members = use_case(organization_id=organization_id)
    return [OrganizationMemberResponse.model_validate(m) for m in members]
