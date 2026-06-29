import pytest
import asyncio
from unittest.mock import patch, AsyncMock
from app.infrastructure.git.git_gateway import LocalGitGateway

@pytest.fixture
def gateway():
    return LocalGitGateway()

@pytest.mark.asyncio
@patch('app.infrastructure.git.git_gateway.asyncio.create_subprocess_exec')
async def test_get_current_branch(mock_exec, gateway):
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"main\n", b"")
    mock_process.returncode = 0
    mock_exec.return_value = mock_process

    branch = await gateway.get_current_branch("/fake/path")

    assert branch.name == "main"
    assert branch.is_active is True
    mock_exec.assert_called_once_with(
        'git', 'branch', '--show-current',
        cwd='/fake/path',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )

@pytest.mark.asyncio
@patch('app.infrastructure.git.git_gateway.asyncio.create_subprocess_exec')
async def test_get_recent_commits(mock_exec, gateway):
    mock_process = AsyncMock()
    fake_log = b"abcdef123|Init commit|Author Name|2023-10-10T10:00:00Z\n"
    mock_process.communicate.return_value = (fake_log, b"")
    mock_process.returncode = 0
    mock_exec.return_value = mock_process

    commits = await gateway.get_recent_commits("/fake/path", limit=1)

    assert len(commits) == 1
    assert commits[0].hash == "abcdef123"
    assert commits[0].message == "Init commit"
    assert commits[0].author == "Author Name"
    assert commits[0].timestamp == "2023-10-10T10:00:00Z"

    mock_exec.assert_called_once_with(
        'git', 'log', '-n1', '--format=%H|%s|%an|%cI',
        cwd='/fake/path',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )

@pytest.mark.asyncio
@patch('app.infrastructure.git.git_gateway.asyncio.create_subprocess_exec')
async def test_get_commit_diff(mock_exec, gateway):
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"diff --git a/file b/file\n", b"")
    mock_process.returncode = 0
    mock_exec.return_value = mock_process

    diff = await gateway.get_commit_diff("/fake/path", "abcdef123")

    assert "diff --git" in diff
    mock_exec.assert_called_once_with(
        'git', 'show', 'abcdef123',
        cwd='/fake/path',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
