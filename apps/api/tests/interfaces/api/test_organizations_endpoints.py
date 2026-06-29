import pytest
from fastapi.testclient import TestClient
from uuid import uuid4, UUID
from datetime import datetime

from app.domain.user import User
from app.domain.organization import Organization
from app.domain.organization_member import OrganizationMember, Role
from app.interfaces.api.dependencies import get_current_user
from app.interfaces.api.v1.organizations import get_organization_repository
from app.interfaces.organization_repository import OrganizationRepository
from main import app

class MockOrganizationRepository(OrganizationRepository):
    def __init__(self):
        self.orgs = {}
        self.members = []

    def save(self, org: Organization) -> None:
        self.orgs[org.id] = org

    def get_by_id(self, id: UUID) -> Organization | None:
        return self.orgs.get(id)

    def save_member(self, member: OrganizationMember) -> None:
        self.members.append(member)

    def get_member(self, organization_id: UUID, user_id: UUID) -> OrganizationMember | None:
        for m in self.members:
            if m.organization_id == organization_id and m.user_id == user_id:
                return m
        return None

    def get_member_by_id(self, member_id: UUID) -> OrganizationMember | None:
        for m in self.members:
            if m.id == member_id:
                return m
        return None

    def get_members(self, organization_id: UUID) -> list[OrganizationMember]:
        return [m for m in self.members if m.organization_id == organization_id]

    def remove_member(self, member_id: UUID) -> None:
        self.members = [m for m in self.members if m.id != member_id]

mock_user = User(id=uuid4(), email="test@test.com", name="Test")
mock_repo = MockOrganizationRepository()

def override_get_current_user():
    return mock_user

def override_get_organization_repository():
    return mock_repo

app.dependency_overrides[get_current_user] = override_get_current_user
app.dependency_overrides[get_organization_repository] = override_get_organization_repository

client = TestClient(app)

def test_create_organization():
    response = client.post("/api/v1/organizations", json={"name": "Test Org"})
    assert response.status_code == 201
    assert response.json()["name"] == "Test Org"
    org_id = UUID(response.json()["id"])
    assert mock_repo.get_by_id(org_id) is not None

def test_invite_member():
    org = Organization(name="Test Org 2")
    mock_repo.save(org)
    invitee_id = uuid4()
    
    response = client.post(
        f"/api/v1/organizations/{org.id}/members",
        json={"invitee_id": str(invitee_id), "role": "admin"}
    )
    assert response.status_code == 201
    assert response.json()["role"] == "admin"
    assert response.json()["user_id"] == str(invitee_id)
    assert response.json()["organization_id"] == str(org.id)

def test_list_members():
    org = Organization(name="Test Org 3")
    mock_repo.save(org)
    member = OrganizationMember(organization_id=org.id, user_id=uuid4(), role=Role.OWNER)
    mock_repo.save_member(member)
    
    response = client.get(f"/api/v1/organizations/{org.id}/members")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] == str(member.id)

