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
