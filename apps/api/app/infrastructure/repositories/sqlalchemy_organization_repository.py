from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.organization import Organization
from app.domain.organization_member import OrganizationMember
from app.infrastructure.db.models import OrganizationModel, OrganizationMemberModel
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
        self._session.merge(model)
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

    def save_member(self, member: OrganizationMember) -> None:
        model = OrganizationMemberModel(
            id=member.id,
            organization_id=member.organization_id,
            user_id=member.user_id,
            role=member.role,
            created_at=member.created_at,
        )
        self._session.merge(model)
        self._session.commit()

    def get_member(self, organization_id: UUID, user_id: UUID) -> OrganizationMember | None:
        stmt = select(OrganizationMemberModel).where(
            OrganizationMemberModel.organization_id == organization_id,
            OrganizationMemberModel.user_id == user_id
        )
        model = self._session.execute(stmt).scalar_one_or_none()

        if model is None:
            return None

        return OrganizationMember(
            id=model.id,
            organization_id=model.organization_id,
            user_id=model.user_id,
            role=model.role,
            created_at=model.created_at,
        )

    def get_member_by_id(self, member_id: UUID) -> OrganizationMember | None:
        model = self._session.get(OrganizationMemberModel, member_id)

        if model is None:
            return None

        return OrganizationMember(
            id=model.id,
            organization_id=model.organization_id,
            user_id=model.user_id,
            role=model.role,
            created_at=model.created_at,
        )

    def get_members(self, organization_id: UUID) -> list[OrganizationMember]:
        stmt = select(OrganizationMemberModel).where(
            OrganizationMemberModel.organization_id == organization_id
        )
        models = self._session.execute(stmt).scalars().all()

        return [
            OrganizationMember(
                id=m.id,
                organization_id=m.organization_id,
                user_id=m.user_id,
                role=m.role,
                created_at=m.created_at,
            )
            for m in models
        ]

    def remove_member(self, member_id: UUID) -> None:
        model = self._session.get(OrganizationMemberModel, member_id)
        if model:
            self._session.delete(model)
            self._session.commit()
