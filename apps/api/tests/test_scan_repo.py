import uuid
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.application.scan_repo import ScanLocalRepository
from app.domain.exceptions import ScannerError
from app.domain.git_models import GitBranch, GitCommit


@pytest.fixture
def mock_gateway():
    gateway = AsyncMock()
    gateway.get_current_branch.return_value = GitBranch(name="main", is_active=True)
    gateway.get_recent_commits.return_value = [
        GitCommit(hash="123", message="init", author="A", timestamp="2023-01-01")
    ]
    return gateway


@pytest.fixture
def mock_repository():
    repo = AsyncMock()
    async def save(project_in):
        if not project_in.id:
            project_in.id = uuid.uuid4()
        return project_in
    repo.save_project.side_effect = save
    return repo


@pytest.mark.asyncio
@patch.object(Path, "is_dir", return_value=True)
async def test_scan_local_repository_success(mock_is_dir, mock_gateway, mock_repository):
    use_case = ScanLocalRepository(mock_gateway, mock_repository)

    result = await use_case.execute("/tmp/myrepo")

    assert result.id is not None
    assert "/tmp/myrepo" in result.path
    assert result.name == "myrepo"

    mock_gateway.get_current_branch.assert_called_once()
    mock_gateway.get_recent_commits.assert_called_once()
    mock_repository.save_project.assert_called_once()


@pytest.mark.asyncio
@patch.object(Path, "is_dir", return_value=False)
async def test_scan_local_repository_not_found(mock_is_dir, mock_gateway, mock_repository):
    use_case = ScanLocalRepository(mock_gateway, mock_repository)

    with pytest.raises(ValueError, match="Repository path does not exist"):
        await use_case.execute("/tmp/missing")

    mock_gateway.get_current_branch.assert_not_called()
    mock_repository.save_project.assert_not_called()


@pytest.mark.asyncio
@patch.object(Path, "is_dir", return_value=True)
async def test_scan_local_repository_git_failure_raises_scanner_error(
    mock_is_dir, mock_gateway, mock_repository,
):
    mock_gateway.get_current_branch.side_effect = RuntimeError("Not a git repo")
    use_case = ScanLocalRepository(mock_gateway, mock_repository)

    with pytest.raises(ScannerError, match="Git repository scan failed"):
        await use_case.execute("/tmp/myrepo")

    mock_repository.save_project.assert_not_called()
