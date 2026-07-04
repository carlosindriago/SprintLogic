import os
from app.domain.project import Project
from app.domain.path_validator import PathSecurityValidator
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.git.git_gateway import LocalGitGateway


class ScanLocalRepository:
    def __init__(self, git_gateway: LocalGitGateway, repository: SQLAlchemyProjectRepository):
        self.git_gateway = git_gateway
        self.repository = repository

    async def execute(self, repo_path: str) -> Project:
        canonical = PathSecurityValidator.validate_project_path(repo_path)

        if not canonical.is_dir():
            raise ValueError(f"Repository path does not exist: {repo_path}")

        try:
            branch = await self.git_gateway.get_current_branch(str(canonical))
            commits = await self.git_gateway.get_recent_commits(str(canonical), limit=1)
        except Exception:
            pass

        repo_name = canonical.name or os.path.basename(str(canonical))
        project = Project(path=str(canonical), name=repo_name)

        saved_project = await self.repository.save_project(project)
        return saved_project
