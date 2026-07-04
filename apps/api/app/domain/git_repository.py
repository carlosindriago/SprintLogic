from typing import Protocol

from app.domain.git_models import GitRepository


class GitRepoRepository(Protocol):
    async def save_repository(self, repository: GitRepository) -> GitRepository:
        ...

    async def get_repository(self, repo_id: int) -> GitRepository | None:
        ...
