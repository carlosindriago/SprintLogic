import os
from pathlib import Path

import pytest

from app.domain.exceptions import PathBlockedError
from app.domain.path_validator import PathSecurityValidator


class TestPathSecurityValidator:

    def test_empty_path_raises(self):
        with pytest.raises(PathBlockedError, match="cannot be empty"):
            PathSecurityValidator.validate_project_path("")

    def test_whitespace_path_raises(self):
        with pytest.raises(PathBlockedError, match="cannot be empty"):
            PathSecurityValidator.validate_project_path("   ")

    def test_root_blocked2(self):
        with pytest.raises(PathBlockedError, match="protected system directory"):
            PathSecurityValidator.validate_project_path("/")

    def test_etc_blocked(self):
        with pytest.raises(PathBlockedError, match="protected system directory"):
            PathSecurityValidator.validate_project_path("/etc")

    def test_root_blocked(self):
        with pytest.raises(PathBlockedError, match="protected system directory"):
            PathSecurityValidator.validate_project_path("/root")

    def test_home_root_blocked(self):
        home = os.path.expanduser("~")
        with pytest.raises(PathBlockedError, match="home directory root"):
            PathSecurityValidator.validate_project_path(home)

    def test_home_subdirectory_allowed(self):
        result = PathSecurityValidator.validate_project_path("/tmp")
        assert isinstance(result, Path)

    def test_tilde_expanded(self):
        result = PathSecurityValidator.validate_project_path("~/projects")
        assert str(result) == os.path.expanduser("~/projects")

    def test_ssh_dir_blocked(self):
        with pytest.raises(PathBlockedError, match="sensitive directory '.ssh'"):
            PathSecurityValidator.validate_project_path("/tmp/.ssh")

    def test_ssh_nested_blocked(self):
        with pytest.raises(PathBlockedError, match="sensitive directory '.ssh'"):
            PathSecurityValidator.validate_project_path("/tmp/project/.ssh/configs")

    def test_gnupg_blocked(self):
        with pytest.raises(PathBlockedError, match="sensitive directory '.gnupg'"):
            PathSecurityValidator.validate_project_path("/home/user/.gnupg")

    def test_proc_blocked(self):
        with pytest.raises(PathBlockedError, match="protected system directory"):
            PathSecurityValidator.validate_project_path("/proc")

    def test_sys_blocked(self):
        with pytest.raises(PathBlockedError, match="protected system directory"):
            PathSecurityValidator.validate_project_path("/sys")

    def test_normal_project_path_allowed(self):
        result = PathSecurityValidator.validate_project_path("/home/user/projects/myapp")
        assert result == Path("/home/user/projects/myapp")

    def test_sensitive_scan_dirs(self):
        assert PathSecurityValidator.is_sensitive_scan_dir(".git")
        assert PathSecurityValidator.is_sensitive_scan_dir("node_modules")
        assert PathSecurityValidator.is_sensitive_scan_dir("__pycache__")
        assert not PathSecurityValidator.is_sensitive_scan_dir("src")
