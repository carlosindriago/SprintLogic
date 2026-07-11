"""
Adapter (Infrastructure): SQLAlchemy implementation of ProjectRepository port.

This class is the ONLY place in the codebase that knows about ProjectModel.
The rest of the application speaks the domain's language: Project objects.
"""
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.ports.project_repository import ProjectRepository
from app.domain.project import Project
from app.infrastructure.db.models import GraphNodeModel, ProjectModel


def _to_domain(model: ProjectModel) -> Project:
    return Project(
        id=model.id,
        path=model.path,
        name=model.name,
        last_opened=model.last_opened,
        created_at=model.created_at,
    )


class SQLAlchemyProjectRepository(ProjectRepository):
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── Write operations ────────────────────────────────────────────────────

    async def save(self, project: Project) -> Project:
        db_model = ProjectModel(
            id=project.id,
            path=project.path,
            name=project.name,
            last_opened=project.last_opened,
            created_at=project.created_at,
        )
        self.session.add(db_model)
        await self.session.flush()
        return project

    async def update(
        self,
        project_id: UUID,
        *,
        name: str | None = None,
        path: str | None = None,
    ) -> Project | None:
        model = await self.session.get(ProjectModel, project_id)
        if not model:
            return None
        if name is not None:
            model.name = name
        if path is not None:
            model.path = path
        await self.session.flush()
        return _to_domain(model)

    async def touch_last_opened(self, project_id: UUID) -> None:
        model = await self.session.get(ProjectModel, project_id)
        if model:
            model.last_opened = datetime.now(UTC)
            await self.session.flush()

    async def delete(self, project_id: UUID) -> bool:
        model = await self.session.get(ProjectModel, project_id)
        if not model:
            return False
        # Remove graph nodes first to satisfy FK constraint
        await self.session.execute(
            delete(GraphNodeModel).where(GraphNodeModel.project_id == project_id)
        )
        await self.session.delete(model)
        await self.session.flush()
        return True

    # ── Read operations ─────────────────────────────────────────────────────

    async def get_by_id(self, project_id: UUID) -> Project | None:
        model = await self.session.get(ProjectModel, project_id)
        return _to_domain(model) if model else None

    async def get_all(self) -> list[Project]:
        result = await self.session.execute(
            select(ProjectModel).order_by(ProjectModel.last_opened.desc().nullslast())
        )
        return [_to_domain(m) for m in result.scalars().all()]

    # ── Legacy aliases (kept for backward compat during migration) ──────────
    # Remove these once all callers use the port's method names.

    async def save_project(self, project: Project) -> Project:
        return await self.save(project)

    async def get_project(self, project_id: UUID) -> Project | None:
        return await self.get_by_id(project_id)

    async def get_all_projects(self) -> list[Project]:
        return await self.get_all()

    async def update_project(
        self, project_id: UUID, name: str | None = None, path: str | None = None
    ) -> Project | None:
        return await self.update(project_id, name=name, path=path)

    async def update_last_opened(self, project_id: UUID) -> None:
        return await self.touch_last_opened(project_id)

    async def delete_project(self, project_id: UUID) -> bool:
        return await self.delete(project_id)
