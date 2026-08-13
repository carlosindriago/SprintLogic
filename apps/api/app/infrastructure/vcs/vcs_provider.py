from abc import ABC, abstractmethod
from typing import Any


class VCSProvider(ABC):
    """
    Abstract interface for Version Control System providers (GitHub, GitLab, etc.).
    """

    @abstractmethod
    async def get_pull_requests(self, project_path: str) -> list[dict[str, Any]]:
        """Retrieve a list of pull requests."""
        pass

    @abstractmethod
    async def create_pull_request(
        self, project_path: str, title: str, head: str, base: str, body: str
    ) -> dict[str, Any]:
        """Create a new pull request."""
        pass

    @abstractmethod
    async def get_ci_status(self, project_path: str, ref: str) -> dict[str, Any]:
        """Get CI/CD status for a specific reference (commit, branch, PR number)."""
        pass
