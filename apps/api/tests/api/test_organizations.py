import asyncio
from uuid import UUID

import httpx

from app.domain.organization import Organization
from app.domain.organization_member import OrganizationMember
from app.interfaces.organization_repository import OrganizationRepository
from app.interfaces.api.v1.organizations import get_organization_repository
from main import app


class FakeOrganizationRepository(OrganizationRepository):
    def __init__(self) -> None:
        self.saved_organization: Organization | None = None
        self.members: list[OrganizationMember] = []

    def save(self, org: Organization) -> None:
        self.saved_organization = org

    def get_by_id(self, id: UUID) -> Organization | None:
        if self.saved_organization and self.saved_organization.id == id:
            return self.saved_organization
        return None

    def save_member(self, member: OrganizationMember) -> None:
        self.members.append(member)

    def get_member(self, organization_id: UUID, user_id: UUID) -> OrganizationMember | None:
        return next((m for m in self.members if m.organization_id == organization_id and m.user_id == user_id), None)

    def get_member_by_id(self, member_id: UUID) -> OrganizationMember | None:
        return next((m for m in self.members if m.id == member_id), None)

    def get_members(self, organization_id: UUID) -> list[OrganizationMember]:
        return [m for m in self.members if m.organization_id == organization_id]

    def remove_member(self, member_id: UUID) -> None:
        self.members = [m for m in self.members if m.id != member_id]


from uuid import uuid4
from app.domain.user import User
from app.interfaces.api.dependencies import get_current_user

def test_create_organization_returns_201_and_created_uuid() -> None:
    repository = FakeOrganizationRepository()
    creator_id = uuid4()
    
    async def override_repository() -> OrganizationRepository:
        return repository
        
    async def override_get_current_user() -> User:
        return User(id=creator_id, email="test@example.com", name="Test User")

    app.dependency_overrides[get_organization_repository] = override_repository
    app.dependency_overrides[get_current_user] = override_get_current_user

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
    assert len(repository.members) == 1
    assert repository.members[0].user_id == creator_id
