from unittest.mock import MagicMock

from uuid import uuid4
from datetime import datetime, UTC

from app.domain.organization import Organization
from app.domain.organization_member import OrganizationMember, Role
from app.infrastructure.db.models import OrganizationModel, OrganizationMemberModel
from app.infrastructure.repositories.sqlalchemy_organization_repository import SQLAlchemyOrganizationRepository


def test_save_organization():
    mock_session = MagicMock()
    repo = SQLAlchemyOrganizationRepository(session=mock_session)
    
    org = Organization(name="Test Org")
    repo.save(org)
    
    mock_session.merge.assert_called_once()
    mock_session.commit.assert_called_once()
    
    # Extract the argument passed to merge
    args, kwargs = mock_session.merge.call_args
    model = args[0]
    assert isinstance(model, OrganizationModel)
    assert model.id == org.id
    assert model.name == org.name


def test_save_member():
    mock_session = MagicMock()
    repo = SQLAlchemyOrganizationRepository(session=mock_session)
    
    member = OrganizationMember(organization_id=uuid4(), user_id=uuid4(), role=Role.ADMIN)
    repo.save_member(member)
    
    mock_session.merge.assert_called_once()
    mock_session.commit.assert_called_once()
    
    args, kwargs = mock_session.merge.call_args
    model = args[0]
    assert isinstance(model, OrganizationMemberModel)
    assert model.id == member.id
    assert model.organization_id == member.organization_id
    assert model.user_id == member.user_id
    assert model.role == Role.ADMIN
