from uuid import uuid4
import pytest
from app.application.invite_member import InviteMember
from app.domain.organization import Organization
from app.domain.organization_member import OrganizationMember, Role
from tests.api.test_organizations import FakeOrganizationRepository

def test_invite_member_success() -> None:
    repository = FakeOrganizationRepository()
    use_case = InviteMember(repository)
    
    org_id = uuid4()
    org = Organization(name="Pixel Studio", id=org_id)
    repository.save(org)
    
    inviter_id = uuid4()
    invitee_id = uuid4()
    
    # Needs to be owner or admin realistically, but rule says "user cannot invite themselves, org must exist"
    
    use_case(organization_id=org_id, inviter_id=inviter_id, invitee_id=invitee_id, role=Role.MEMBER)
    
    member = repository.get_member(org_id, invitee_id)
    assert member is not None
    assert member.role == Role.MEMBER

def test_invite_member_fails_if_org_not_exists() -> None:
    repository = FakeOrganizationRepository()
    use_case = InviteMember(repository)
    
    with pytest.raises(ValueError, match="Organization does not exist"):
        use_case(organization_id=uuid4(), inviter_id=uuid4(), invitee_id=uuid4(), role=Role.MEMBER)

def test_invite_member_fails_if_invite_self() -> None:
    repository = FakeOrganizationRepository()
    use_case = InviteMember(repository)
    
    org_id = uuid4()
    org = Organization(name="Pixel Studio", id=org_id)
    repository.save(org)
    
    user_id = uuid4()
    with pytest.raises(ValueError, match="User cannot invite themselves"):
        use_case(organization_id=org_id, inviter_id=user_id, invitee_id=user_id, role=Role.MEMBER)
