"""
Adapter (Infrastructure): Implements CodebaseProvider for a local filesystem.

Key design decisions:
- Uses pathspec for .gitignore-style pattern matching (avoids scanning venvs,
  build artifacts, etc.) — reads the project's own .gitignore when available.
- Uses aiofiles for non-blocking file I/O inside the ASGI event loop.
- Emits an initial 'discovering' count so the frontend can render a
  determinate progress bar instead of an indeterminate spinner.
"""
import asyncio
import logging
import os
from collections.abc import AsyncIterator
from pathlib import Path

import aiofiles  # type: ignore
import pathspec

from app.domain.ports.codebase_provider import CodebaseProvider

_logger = logging.getLogger(__name__)

# Baseline patterns — always ignored regardless of the project's .gitignore.
# Written in gitignore syntax so pathspec can compile them.
_BASELINE_IGNORE_PATTERNS: list[str] = [
    # Version control
    ".git/",
    # Python
    "__pycache__/",
    "*.pyc",
    "*.pyo",
    ".venv/",
    "venv/",
    "*.egg-info/",
    "test_env/",
    ".mypy_cache/",
    ".ruff_cache/",
    ".pytest_cache/",
    # JavaScript / Node
    "node_modules/",
    ".next/",
    ".turbo/",
    # PHP / Laravel / Composer
    "vendor/",
    "storage/",
    "bootstrap/cache/",
    # Build outputs
    "dist/",
    "build/",
    "target/",
    "coverage/",
    "out/",
    # IDE / OS
    ".idea/",
    ".vscode/",
    ".DS_Store",
    "Thumbs.db",
]

MAX_FILE_BYTES = 500_000  # 500 KB — skip auto-generated or minified blobs


def _build_spec(root: Path) -> pathspec.PathSpec:
    """
    Merges baseline patterns with the project's own .gitignore (if it exists).
    Returns a compiled PathSpec that can match relative paths efficiently.
    """
    patterns = list(_BASELINE_IGNORE_PATTERNS)

    gitignore = root / ".gitignore"
    if gitignore.is_file():
        try:
            extra = gitignore.read_text(encoding="utf-8", errors="ignore").splitlines()
            patterns.extend(extra)
            _logger.debug("Loaded %d patterns from %s", len(extra), gitignore)
        except OSError as exc:
            _logger.warning("Could not read .gitignore: %s", exc)

    return pathspec.PathSpec.from_lines("gitwildmatch", patterns)


class LocalFileSystemProvider(CodebaseProvider):
    """
    Reads source files from the local disk asynchronously.

    Phase 1 — Discovery (_walk): collects all candidate paths using pathspec
               filtering. This is synchronous but cheap (stat calls only).
    Phase 2 — Reading (get_source_files): reads each file with aiofiles,
               yielding control back to the event loop after every file.
    """

    def __init__(self, root_path: str) -> None:
        self.root_path = Path(root_path).resolve()
        self._spec = _build_spec(self.root_path)

    def discover(self, extension_filter: list[str] | None = None) -> list[Path]:
        """
        Returns the full list of candidate files (no I/O beyond stat).
        Uses os.walk with directory pruning to avoid traversing ignored directories (like vendor/ or node_modules/).
        """
        ext_set = set(extension_filter) if extension_filter else None
        results: list[Path] = []
        root_str = str(self.root_path)

        for root, dirs, files in os.walk(root_str):
            rel_root = os.path.relpath(root, root_str)
            # Prune ignored directories in place so os.walk never enters vendor/, node_modules/, .git/, etc.
            dirs[:] = [
                d for d in dirs
                if not self._spec.match_file(
                    d + "/" if rel_root == "." else f"{rel_root}/{d}/"
                )
            ]

            for file in files:
                full_path = Path(root) / file
                rel_file = full_path.relative_to(self.root_path).as_posix()
                if self._spec.match_file(rel_file):
                    continue
                if ext_set and full_path.suffix.lower() not in ext_set:
                    continue
                try:
                    if full_path.stat().st_size > MAX_FILE_BYTES:
                        continue
                except OSError:
                    continue
                results.append(full_path)

        return results

    async def get_source_files(
        self, extension_filter: list[str] | None = None
    ) -> AsyncIterator[tuple[str, str]]:
        """
        Async generator that yields (logical_path, content) for every
        discovered file, yielding control between reads.
        """
        candidates = self.discover(extension_filter)

        for file_path in candidates:
            try:
                async with aiofiles.open(file_path, encoding="utf-8", errors="ignore") as f:
                    content = await f.read()
                yield str(file_path), content
            except Exception as exc:
                _logger.warning("Could not read %s: %s", file_path, exc)

            # Cooperative multitasking — keep ASGI event loop responsive
            await asyncio.sleep(0)
