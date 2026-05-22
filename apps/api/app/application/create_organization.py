from __future__ import annotations

from app.domain.organization import Organization
from app.interfaces.organization_repository import OrganizationRepository


class CreateOrganization:
    def __init__(self, repository: OrganizationRepository) -> None:
        self._repository = repository

    def __call__(self, *, name: str) -> Organization:
        organization = Organization(name=name)
        self._repository.save(organization)
        return organization
