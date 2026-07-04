import os
from pathlib import Path

from app.domain.exceptions import PathBlockedError

BLOCKED_ROOTS: set[str] = {
    "/",
    "/boot",
    "/dev",
    "/etc",
    "/lib",
    "/lib64",
    "/proc",
    "/root",
    "/sbin",
    "/sys",
    "/usr",
    "/var",
}

BLOCKED_SENSITIVE_DIRS: frozenset[str] = frozenset({".ssh", ".gnupg"})

SENSITIVE_SCAN_DIRS: frozenset[str] = frozenset({".git", "node_modules", "__pycache__"})


class PathSecurityValidator:

    @staticmethod
    def validate_project_path(raw_path: str) -> Path:
        if not raw_path or not raw_path.strip():
            raise PathBlockedError(raw_path or "<empty>", "Path cannot be empty")

        expanded = os.path.expanduser(raw_path.strip())

        try:
            canonical = Path(expanded).resolve(strict=False)
        except (OSError, RuntimeError) as e:
            raise PathBlockedError(raw_path, f"Cannot resolve path: {e}")

        canonical_str = str(canonical)

        if canonical_str in BLOCKED_ROOTS:
            raise PathBlockedError(
                raw_path, f"{canonical_str} is a protected system directory"
            )

        if canonical.parent == Path("/home") and canonical_str not in BLOCKED_ROOTS:
            raise PathBlockedError(
                raw_path, f"{canonical_str} is the home directory root — scanning is not allowed"
            )

        for part in canonical.parts:
            if part in BLOCKED_SENSITIVE_DIRS:
                raise PathBlockedError(
                    raw_path, f"Path contains sensitive directory '{part}'"
                )

        return canonical

    @staticmethod
    def is_sensitive_scan_dir(dirname: str) -> bool:
        return dirname in SENSITIVE_SCAN_DIRS
