import asyncio
from uuid import UUID

import httpx

from app.domain.organization import Organization
from app.interfaces.organization_repository import OrganizationRepository
from app.interfaces.api.v1.organizations import get_organization_repository
from main import app


class FakeOrganizationRepository(OrganizationRepository):
    def __init__(self) -> None:
        self.saved_organization: Organization | None = None

    def save(self, org: Organization) -> None:
        self.saved_organization = org

    def get_by_id(self, id: UUID) -> Organization | None:
        if self.saved_organization and self.saved_organization.id == id:
            return self.saved_organization
        return None


def test_create_organization_returns_201_and_created_uuid() -> None:
    repository = FakeOrganizationRepository()

    async def override_repository() -> OrganizationRepository:
        return repository

    app.dependency_overrides[get_organization_repository] = override_repository

    async def send_request() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.post("/api/v1/organizations", json={"name": "Pixel Studio"})

    response = asyncio.run(send_request())

    app.dependency_overrides.clear()

    assert response.status_code == 201

    payload = response.json()
    assert UUID(payload["id"])
    assert payload["name"] == "Pixel Studio"
    assert repository.saved_organization is not None
