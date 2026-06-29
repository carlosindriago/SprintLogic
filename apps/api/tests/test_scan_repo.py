import pytest
import os
import uuid
from unittest.mock import AsyncMock, patch
from app.application.scan_repo import ScanLocalRepository
from app.domain.git_models import GitBranch, GitCommit
from app.domain.project import Project

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
@patch('os.path.exists', return_value=True)
async def test_scan_local_repository_success(mock_exists, mock_gateway, mock_repository):
    use_case = ScanLocalRepository(mock_gateway, mock_repository)
    
    result = await use_case.execute("/fake/path/myrepo")
    
    assert result.id is not None
    assert result.path == "/fake/path/myrepo"
    assert result.name == "myrepo"
    
    mock_gateway.get_current_branch.assert_called_once_with("/fake/path/myrepo")
    mock_gateway.get_recent_commits.assert_called_once_with("/fake/path/myrepo", limit=1)
    mock_repository.save_project.assert_called_once()

@pytest.mark.asyncio
@patch('os.path.exists', return_value=False)
async def test_scan_local_repository_not_found(mock_exists, mock_gateway, mock_repository):
    use_case = ScanLocalRepository(mock_gateway, mock_repository)
    
    with pytest.raises(ValueError, match="Repository path does not exist"):
        await use_case.execute("/missing/path")
        
    mock_gateway.get_current_branch.assert_not_called()
    mock_repository.save_project.assert_not_called()
