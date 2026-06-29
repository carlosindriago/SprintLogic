import os
from app.domain.project import Project
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.git.git_gateway import LocalGitGateway

class ScanLocalRepository:
    def __init__(self, git_gateway: LocalGitGateway, repository: SQLAlchemyProjectRepository):
        self.git_gateway = git_gateway
        self.repository = repository

    async def execute(self, repo_path: str) -> Project:
        if not os.path.exists(repo_path):
            raise ValueError(f"Repository path does not exist: {repo_path}")

        try:
            branch = await self.git_gateway.get_current_branch(repo_path)
            commits = await self.git_gateway.get_recent_commits(repo_path, limit=1)
        except Exception as e:
            # We don't strictly require it to be a valid git repo anymore for Project, but we can leave it for now
            pass
            
        repo_name = os.path.basename(os.path.normpath(repo_path))
        project = Project(path=repo_path, name=repo_name)
        
        saved_project = await self.repository.save_project(project)
        return saved_project
