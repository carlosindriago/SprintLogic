from app.application.create_organization import CreateOrganization
from app.domain.organization import Organization
from app.interfaces.organization_repository import OrganizationRepository


class FakeOrganizationRepository(OrganizationRepository):
    def __init__(self) -> None:
        self.saved_organization: Organization | None = None

    def save(self, org: Organization) -> None:
        self.saved_organization = org

    def get_by_id(self, id_):
        if self.saved_organization and self.saved_organization.id == id_:
            return self.saved_organization
        return None


def test_create_organization_saves_and_returns_entity() -> None:
    repository = FakeOrganizationRepository()
    use_case = CreateOrganization(repository)

    organization = use_case(name="Pixel Studio")

    assert organization.name == "Pixel Studio"
    assert repository.saved_organization == organization
