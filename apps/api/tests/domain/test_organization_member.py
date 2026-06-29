from datetime import datetime
from uuid import UUID, uuid4

import pytest

from app.domain.organization_member import OrganizationMember, Role


def test_create_valid_organization_member() -> None:
    org_id = uuid4()
    user_id = uuid4()
    
    member = OrganizationMember(
        organization_id=org_id,
        user_id=user_id,
        role=Role.ADMIN
    )

    assert isinstance(member.id, UUID)
    assert member.organization_id == org_id
    assert member.user_id == user_id
    assert member.role == Role.ADMIN
    assert isinstance(member.created_at, datetime)


def test_create_organization_member_defaults_to_member_role() -> None:
    org_id = uuid4()
    user_id = uuid4()
    
    member = OrganizationMember(
        organization_id=org_id,
        user_id=user_id
    )

    assert member.role == Role.MEMBER

def test_create_organization_member_with_invalid_org_id_raises_error() -> None:
    with pytest.raises(ValueError, match="Invalid organization_id"):
        OrganizationMember(organization_id="not-a-uuid", user_id=uuid4()) # type: ignore

def test_create_organization_member_with_invalid_user_id_raises_error() -> None:
    with pytest.raises(ValueError, match="Invalid user_id"):
        OrganizationMember(organization_id=uuid4(), user_id="not-a-uuid") # type: ignore
