import os
import stat
from pathlib import Path

import pytest

from app.infrastructure.security.toolchain import SecurityToolchainManager


def test_system_info_detection():
    os_name, arch_name = SecurityToolchainManager.get_system_info()
    assert os_name in ("linux", "darwin", "windows")
    assert arch_name in ("x64", "arm64", "armv7")


def test_binary_filename(tmp_path: Path):
    manager = SecurityToolchainManager(base_dir=tmp_path)
    binary_name = manager.get_binary_filename("gitleaks")
    if os.name == "nt":
        assert binary_name == "gitleaks.exe"
    else:
        assert binary_name == "gitleaks"


def test_get_tool_path(tmp_path: Path):
    manager = SecurityToolchainManager(base_dir=tmp_path)
    path = manager.get_tool_path("gitleaks", "8.18.2")
    assert path.parent.name == "8.18.2"
    assert path.parent.parent.name == "gitleaks"


def test_get_download_url(tmp_path: Path):
    manager = SecurityToolchainManager(base_dir=tmp_path)
    url = manager.get_download_url("gitleaks", "8.18.2")
    assert url is not None
    assert "https://github.com/gitleaks/gitleaks/releases/download/v8.18.2/" in url
    assert "8.18.2" in url


@pytest.mark.asyncio
async def test_get_or_download_tool_existing(tmp_path: Path):
    manager = SecurityToolchainManager(base_dir=tmp_path)
    target_path = manager.get_tool_path("gitleaks", "8.18.2")
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text("#!/bin/sh\necho 'fake binary'")
    os.chmod(target_path, stat.S_IRWXU)

    assert manager.is_tool_available("gitleaks", "8.18.2") is True
    resolved = await manager.get_or_download_tool("gitleaks", "8.18.2")
    assert resolved == target_path


def test_get_status(tmp_path: Path):
    manager = SecurityToolchainManager(base_dir=tmp_path)
    status = manager.get_status()
    assert "platform" in status
    assert "tools" in status
    assert "gitleaks" in status["tools"]
    assert "semgrep" in status["tools"]
