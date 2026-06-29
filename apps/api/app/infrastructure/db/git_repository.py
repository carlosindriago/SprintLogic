import os
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.git_models import GitRepository
from app.domain.git_repository import GitRepoRepository
from app.infrastructure.db.models import GitRepositoryModel

class SQLAlchemyGitRepoRepository(GitRepoRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def save_repository(self, repository: GitRepository) -> GitRepository:
        db_model = GitRepositoryModel(
            path=repository.path,
            name=repository.name
        )
        self.session.add(db_model)
        await self.session.flush()
        repository.id = db_model.id
        return repository

    async def get_repository(self, repo_id: int) -> GitRepository | None:
        model = await self.session.get(GitRepositoryModel, repo_id)
        if model:
            return GitRepository(id=model.id, path=model.path, name=model.name)
        return None
