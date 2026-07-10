"""
Adapter (Infrastructure): Implements CodebaseProvider for a local filesystem.
Uses aiofiles for truly non-blocking I/O inside the async event loop.
"""
import asyncio
import logging
from pathlib import Path
from typing import AsyncIterator, Tuple

import aiofiles

from app.domain.ports.codebase_provider import CodebaseProvider

_logger = logging.getLogger(__name__)

IGNORE_DIRS = frozenset({
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    ".next", "dist", "build", "target", ".turbo", "coverage",
    ".mypy_cache", ".ruff_cache", ".pytest_cache",
    "test_env", "*.egg-info",
})

MAX_FILE_BYTES = 500_000  # 500 KB — skip auto-generated or minified blobs


class LocalFileSystemProvider(CodebaseProvider):
    """
    Reads source files from the local disk asynchronously.
    Yields control back to the event loop between each file via asyncio.sleep(0).
    """

    def __init__(self, root_path: str) -> None:
        self.root_path = Path(root_path).resolve()

    async def get_source_files(
        self, extension_filter: list[str] | None = None
    ) -> AsyncIterator[Tuple[str, str]]:
        ext_set = set(extension_filter) if extension_filter else None

        for file_path in self._walk():
            if ext_set and file_path.suffix.lower() not in ext_set:
                continue

            if file_path.stat().st_size > MAX_FILE_BYTES:
                _logger.debug("Skipping large file: %s", file_path)
                continue

            try:
                async with aiofiles.open(file_path, encoding="utf-8", errors="ignore") as f:
                    content = await f.read()
                yield str(file_path), content
            except Exception as exc:
                _logger.warning("Could not read %s: %s", file_path, exc)

            # Yield control — keeps the event loop responsive between files
            await asyncio.sleep(0)

    def _walk(self) -> list[Path]:
        """
        Collects all candidate file paths synchronously (cheap: just stat calls).
        Actual I/O happens asynchronously in get_source_files.
        """
        results: list[Path] = []
        for path in self.root_path.rglob("*"):
            if any(part in IGNORE_DIRS for part in path.parts):
                continue
            if path.is_file():
                results.append(path)
        return results
