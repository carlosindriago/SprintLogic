import pytest
import os
from unittest.mock import AsyncMock, patch
from app.application.scan_repo import ScanLocalRepository
from app.domain.git_models import GitBranch, GitCommit, GitRepository

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
    async def save(repo_in):
        repo_in.id = 1
        return repo_in
    repo.save_repository.side_effect = save
    return repo

@pytest.mark.asyncio
@patch('os.path.exists', return_value=True)
async def test_scan_local_repository_success(mock_exists, mock_gateway, mock_repository):
    use_case = ScanLocalRepository(mock_gateway, mock_repository)
    
    result = await use_case.execute("/fake/path/myrepo")
    
    assert result.id == 1
    assert result.path == "/fake/path/myrepo"
    assert result.name == "myrepo"
    
    mock_gateway.get_current_branch.assert_called_once_with("/fake/path/myrepo")
    mock_gateway.get_recent_commits.assert_called_once_with("/fake/path/myrepo", limit=1)
    mock_repository.save_repository.assert_called_once()

@pytest.mark.asyncio
@patch('os.path.exists', return_value=False)
async def test_scan_local_repository_not_found(mock_exists, mock_gateway, mock_repository):
    use_case = ScanLocalRepository(mock_gateway, mock_repository)
    
    with pytest.raises(ValueError, match="Repository path does not exist"):
        await use_case.execute("/missing/path")
        
    mock_gateway.get_current_branch.assert_not_called()
    mock_repository.save_repository.assert_not_called()
