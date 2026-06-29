import os
from app.domain.git_models import GitRepository
from app.domain.git_repository import GitRepoRepository
from app.infrastructure.git.git_gateway import LocalGitGateway

class ScanLocalRepository:
    def __init__(self, git_gateway: LocalGitGateway, repository: GitRepoRepository):
        self.git_gateway = git_gateway
        self.repository = repository

    async def execute(self, repo_path: str) -> GitRepository:
        if not os.path.exists(repo_path):
            raise ValueError(f"Repository path does not exist: {repo_path}")

        # Fetch current branch and recent commits to ensure it's a valid git repo
        # and we can access it using the gateway.
        try:
            branch = await self.git_gateway.get_current_branch(repo_path)
            commits = await self.git_gateway.get_recent_commits(repo_path, limit=1)
        except Exception as e:
            raise ValueError(f"Failed to scan git repository at {repo_path}: {e}")
            
        repo_name = os.path.basename(os.path.normpath(repo_path))
        git_repo = GitRepository(path=repo_path, name=repo_name)
        
        saved_repo = await self.repository.save_repository(git_repo)
        return saved_repo
