from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.domain.organization import Organization
from app.infrastructure.db.models import OrganizationModel
from app.interfaces.organization_repository import OrganizationRepository


class SQLAlchemyOrganizationRepository(OrganizationRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def save(self, org: Organization) -> None:
        model = OrganizationModel(
            id=org.id,
            name=org.name,
            created_at=org.created_at,
        )
        self._session.add(model)
        self._session.commit()

    def get_by_id(self, id: UUID) -> Organization | None:
        model = self._session.get(OrganizationModel, id)

        if model is None:
            return None

        return Organization(
            id=model.id,
            name=model.name,
            created_at=model.created_at,
        )

    def save_member(self, member) -> None:
        pass

    def get_member(self, organization_id, user_id):
        return None

    def get_member_by_id(self, member_id):
        return None

    def get_members(self, organization_id):
        return []

    def remove_member(self, member_id):
        pass
