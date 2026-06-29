from uuid import uuid4
import pytest
from app.application.remove_member import RemoveMember
from app.domain.organization import Organization
from app.domain.organization_member import OrganizationMember, Role
from tests.api.test_organizations import FakeOrganizationRepository

def test_remove_member_success() -> None:
    repository = FakeOrganizationRepository()
    use_case = RemoveMember(repository)
    
    org_id = uuid4()
    org = Organization(name="Pixel Studio", id=org_id)
    repository.save(org)
    
    owner_id = uuid4()
    member_id = uuid4()
    
    repository.save_member(OrganizationMember(organization_id=org_id, user_id=owner_id, role=Role.OWNER))
    
    member_to_remove = OrganizationMember(organization_id=org_id, user_id=member_id, role=Role.MEMBER)
    repository.save_member(member_to_remove)
    
    use_case(organization_id=org_id, member_id=member_to_remove.id)
    
    assert repository.get_member(org_id, member_id) is None

def test_remove_member_fails_if_only_owner() -> None:
    repository = FakeOrganizationRepository()
    use_case = RemoveMember(repository)
    
    org_id = uuid4()
    org = Organization(name="Pixel Studio", id=org_id)
    repository.save(org)
    
    owner_id = uuid4()
    owner = OrganizationMember(organization_id=org_id, user_id=owner_id, role=Role.OWNER)
    repository.save_member(owner)
    
    with pytest.raises(ValueError, match="Cannot remove the only owner of the organization"):
        use_case(organization_id=org_id, member_id=owner.id)

def test_remove_member_success_if_multiple_owners() -> None:
    repository = FakeOrganizationRepository()
    use_case = RemoveMember(repository)
    
    org_id = uuid4()
    org = Organization(name="Pixel Studio", id=org_id)
    repository.save(org)
    
    owner_id_1 = uuid4()
    owner_id_2 = uuid4()
    
    owner_1 = OrganizationMember(organization_id=org_id, user_id=owner_id_1, role=Role.OWNER)
    owner_2 = OrganizationMember(organization_id=org_id, user_id=owner_id_2, role=Role.OWNER)
    
    repository.save_member(owner_1)
    repository.save_member(owner_2)
    
    use_case(organization_id=org_id, member_id=owner_1.id)
    
    assert repository.get_member(org_id, owner_id_1) is None
    assert repository.get_member(org_id, owner_id_2) is not None
