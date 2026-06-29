from uuid import uuid4

from app.application.create_organization import CreateOrganization
from app.domain.organization import Organization
from app.domain.organization_member import OrganizationMember, Role
from app.interfaces.organization_repository import OrganizationRepository


class FakeOrganizationRepository(OrganizationRepository):
    def __init__(self) -> None:
        self.saved_organization: Organization | None = None
        self.members: list[OrganizationMember] = []

    def save(self, org: Organization) -> None:
        self.saved_organization = org

    def get_by_id(self, id_):
        if self.saved_organization and self.saved_organization.id == id_:
            return self.saved_organization
        return None

    def save_member(self, member: OrganizationMember) -> None:
        self.members.append(member)

    def get_member(self, organization_id, user_id):
        return next((m for m in self.members if m.organization_id == organization_id and m.user_id == user_id), None)

    def get_member_by_id(self, member_id):
        return next((m for m in self.members if m.id == member_id), None)

    def get_members(self, organization_id):
        return [m for m in self.members if m.organization_id == organization_id]

    def remove_member(self, member_id):
        self.members = [m for m in self.members if m.id != member_id]


def test_create_organization_saves_and_returns_entity() -> None:
    repository = FakeOrganizationRepository()
    use_case = CreateOrganization(repository)
    creator_id = uuid4()

    organization = use_case(name="Pixel Studio", creator_id=creator_id)

    assert organization.name == "Pixel Studio"
    assert repository.saved_organization == organization

    owner_member = repository.get_member(organization.id, creator_id)
    assert owner_member is not None
    assert owner_member.role == Role.OWNER
