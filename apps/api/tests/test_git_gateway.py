import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.infrastructure.git.git_gateway import LocalGitGateway


@pytest.fixture
def gateway():
    return LocalGitGateway()


@pytest.mark.asyncio
@patch("app.infrastructure.git.git_gateway.asyncio.create_subprocess_exec")
async def test_get_current_branch(mock_exec, gateway):
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"main\n", b"")
    mock_process.returncode = 0
    mock_exec.return_value = mock_process

    branch = await gateway.get_current_branch("/fake/path")

    assert branch.name == "main"
    assert branch.is_active is True
    mock_exec.assert_called_once_with(
        "git",
        "branch",
        "--show-current",
        cwd="/fake/path",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )


@pytest.mark.asyncio
@patch("app.infrastructure.git.git_gateway.asyncio.create_subprocess_exec")
async def test_get_recent_commits(mock_exec, gateway):
    mock_process = AsyncMock()
    fake_log = (
        b"abcdef123|deadbeef|Init commit|Author Name|email@example.com|2023-10-10T10:00:00Z\n"
    )
    mock_process.communicate.return_value = (fake_log, b"")
    mock_process.returncode = 0
    mock_exec.return_value = mock_process

    commits = await gateway.get_recent_commits("/fake/path", limit=1)

    assert len(commits) == 1
    assert commits[0]["hash"] == "abcdef123"
    assert commits[0]["parents"] == ["deadbeef"]
    assert commits[0]["subject"] == "Init commit"
    assert commits[0]["author"] == "Author Name"
    assert commits[0]["email"] == "email@example.com"
    assert commits[0]["date"] == "2023-10-10T10:00:00Z"


@pytest.mark.asyncio
@patch("app.infrastructure.git.git_gateway.asyncio.create_subprocess_exec")
async def test_get_diff(mock_exec, gateway):
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"diff --git a/file b/file\n", b"")
    mock_process.returncode = 0
    mock_exec.return_value = mock_process

    diff = await gateway.get_diff("/fake/path")

    assert "diff --git" in diff


@pytest.mark.asyncio
@patch("app.infrastructure.git.git_gateway.asyncio.create_subprocess_exec")
async def test_commit_action_requires_files(mock_exec, gateway):
    with pytest.raises(ValueError, match="requires an explicit list of files"):
        await gateway.execute_action("/fake/path", "commit", confirm=True)


@pytest.mark.asyncio
async def test_commit_without_confirm_is_blocked(gateway):
    result = await gateway.execute_action("/fake/path", "commit", files=["test.py"])
    assert result["status"] == "blocked"
    assert "confirmation" in result["message"]


@pytest.mark.asyncio
async def test_push_without_confirm_is_blocked(gateway):
    result = await gateway.execute_action("/fake/path", "push")
    assert result["status"] == "blocked"


@pytest.mark.asyncio
async def test_pull_without_confirm_is_blocked(gateway):
    result = await gateway.execute_action("/fake/path", "pull")
    assert result["status"] == "blocked"


@pytest.mark.asyncio
@patch("app.infrastructure.git.git_gateway.asyncio.create_subprocess_exec")
async def test_commit_with_files_and_confirm(mock_exec, gateway):
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"committed\n", b"")
    mock_process.returncode = 0
    mock_exec.return_value = mock_process

    result = await gateway.execute_action(
        "/fake/path",
        "commit",
        message="feat: add test",
        files=["test.py"],
        confirm=True,
    )

    assert result["status"] == "success"


@pytest.mark.asyncio
@patch("app.infrastructure.git.git_gateway.asyncio.create_subprocess_exec")
async def test_push_with_confirm(mock_exec, gateway):
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"main\n", b"")
    mock_process.returncode = 0
    mock_exec.return_value = mock_process

    result = await gateway.execute_action("/fake/path", "push", confirm=True)

    assert result["status"] == "success"


@pytest.mark.asyncio
@patch("app.infrastructure.git.git_gateway.asyncio.create_subprocess_exec")
async def test_stage_files(mock_exec, gateway):
    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"", b"")
    mock_process.returncode = 0
    mock_exec.return_value = mock_process

    result = await gateway.stage_files("/fake/path", ["file1.py", "file2.py"])

    assert result == ""
    mock_exec.assert_called_once_with(
        "git",
        "add",
        "--",
        "file1.py",
        "file2.py",
        cwd="/fake/path",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )


@pytest.mark.asyncio
async def test_stage_files_empty_list_raises(gateway):
    with pytest.raises(ValueError, match="non-empty list"):
        await gateway.stage_files("/fake/path", [])


@pytest.mark.asyncio
async def test_unknown_action_raises(gateway):
    with pytest.raises(ValueError, match="Unknown action"):
        await gateway.execute_action("/fake/path", "rebase", confirm=True)
