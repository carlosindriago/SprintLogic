from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.project import Project
from app.infrastructure.db.models import ProjectModel


class SQLAlchemyProjectRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def save_project(self, project: Project) -> Project:
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

    async def update_last_opened(self, project_id: UUID) -> None:
        model = await self.session.get(ProjectModel, project_id)
        if model:
            model.last_opened = datetime.now(UTC)
            await self.session.flush()

    async def get_project(self, project_id: UUID) -> Project | None:
        model = await self.session.get(ProjectModel, project_id)
        if model:
            return Project(
                id=model.id,
                path=model.path,
                name=model.name,
                last_opened=model.last_opened,
                created_at=model.created_at,
            )
        return None

    async def update_project(
        self, project_id: UUID, name: str | None = None, path: str | None = None
    ) -> Project | None:
        model = await self.session.get(ProjectModel, project_id)
        if model:
            if name is not None:
                model.name = name
            if path is not None:
                model.path = path
            await self.session.flush()
            return Project(
                id=model.id,
                path=model.path,
                name=model.name,
                last_opened=model.last_opened,
                created_at=model.created_at,
            )
        return None

    async def delete_project(self, project_id: UUID) -> bool:
        model = await self.session.get(ProjectModel, project_id)
        if model:
            # We must delete associated graph nodes first to avoid foreign key constraints
            from sqlalchemy import delete

            from app.infrastructure.db.models import GraphNodeModel

            await self.session.execute(
                delete(GraphNodeModel).where(GraphNodeModel.project_id == project_id)
            )

            await self.session.delete(model)
            await self.session.flush()
            return True
        return False

    async def get_all_projects(self) -> list[Project]:
        result = await self.session.execute(
            select(ProjectModel).order_by(ProjectModel.last_opened.desc().nullslast())
        )
        models = result.scalars().all()
        return [
            Project(
                id=m.id,
                path=m.path,
                name=m.name,
                last_opened=m.last_opened,
                created_at=m.created_at,
            )
            for m in models
        ]
