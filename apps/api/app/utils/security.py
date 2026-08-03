from pathlib import Path

from fastapi import HTTPException


def resolve_project_path(project_root: str | Path, file_path: str) -> Path:
    """Resolve ``file_path`` inside ``project_root``, rejecting traversal attempts.

    Raises HTTP 403 when the resolved path escapes the project root, so
    request-supplied paths cannot read or write files outside the project.
    """
    root = Path(project_root).resolve()
    full_path = (root / file_path).resolve()
    if not full_path.is_relative_to(root):
        raise HTTPException(status_code=403, detail="Path traversal attempt detected")
    return full_path
