from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict

from app.application.create_organization import CreateOrganization
from app.domain.organization import Organization
from app.interfaces.organization_repository import OrganizationRepository

router = APIRouter(prefix="/organizations", tags=["organizations"])


class OrganizationCreateRequest(BaseModel):
    name: str


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime


async def get_organization_repository() -> OrganizationRepository:
    raise NotImplementedError("Organization repository dependency is not configured")


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    request: OrganizationCreateRequest,
    repository: OrganizationRepository = Depends(get_organization_repository),
) -> OrganizationResponse:
    use_case = CreateOrganization(repository)
    organization = use_case(name=request.name)

    return OrganizationResponse.model_validate(organization)
