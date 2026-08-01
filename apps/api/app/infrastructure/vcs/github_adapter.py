from typing import Any

from app.infrastructure.vcs.vcs_provider import VCSProvider


class GitHubAdapter(VCSProvider):
    """
    Mock implementation of a GitHub VCS provider.
    """

    async def get_pull_requests(self, project_path: str) -> list[dict[str, Any]]:
        # Mock data for PRs
        return [
            {
                "id": "1",
                "number": 42,
                "title": "Refactor Git Studio architecture",
                "author": "sprintlogic",
                "state": "open",
                "url": "https://github.com/fake/repo/pull/42",
                "created_at": "2026-07-31T12:00:00Z"
            },
            {
                "id": "2",
                "number": 43,
                "title": "Fix database connection leaks",
                "author": "carlos",
                "state": "open",
                "url": "https://github.com/fake/repo/pull/43",
                "created_at": "2026-07-30T10:30:00Z"
            }
        ]

    async def create_pull_request(self, project_path: str, title: str, head: str, base: str, body: str) -> dict[str, Any]:
        return {"status": "success", "url": "https://github.com/fake/repo/pull/44"}

    async def get_ci_status(self, project_path: str, ref: str) -> dict[str, Any]:
        # Mock data for CI
        # PR 43 fails, others pass
        if "43" in ref:
            return {"status": "failure", "description": "Tests failed on CI"}
        return {"status": "success", "description": "All checks passed"}
