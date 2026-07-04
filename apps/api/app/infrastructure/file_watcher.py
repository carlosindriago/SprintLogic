import asyncio
import hashlib
import logging
import os
from collections.abc import Awaitable, Callable

from watchfiles import Change, awatch

_logger = logging.getLogger(__name__)


class FileWatcherService:

    def __init__(self):
        self._tasks: dict[str, asyncio.Task] = {}
        self._watched_paths: dict[str, str] = {}
        self._backend_writes: dict[str, str] = {}
        self._on_change_callbacks: list[Callable[[str, Change, str], Awaitable[None]]] = []

    def add_callback(self, callback: Callable[[str, Change, str], Awaitable[None]]):
        self._on_change_callbacks.append(callback)

    def mark_backend_write(self, filepath: str, content: str):
        content_hash = hashlib.md5(content.encode()).hexdigest()
        self._backend_writes[filepath] = content_hash

    async def _watch_loop(self, project_id: str, path: str):
        try:
            async for changes in awatch(path, step=500):
                for change, filepath in changes:
                    if ".git/" in filepath or "node_modules/" in filepath:
                        continue

                    if filepath in self._backend_writes:
                        try:
                            with open(filepath, encoding="utf-8") as f:
                                current_content = f.read()
                            current_hash = hashlib.md5(current_content.encode()).hexdigest()

                            if current_hash == self._backend_writes[filepath]:
                                del self._backend_writes[filepath]
                                continue
                        except Exception:
                            pass

                    for callback in self._on_change_callbacks:
                        try:
                            await callback(project_id, change, filepath)
                        except Exception:
                            _logger.error(
                                "Error in watcher callback for project=%s file=%s",
                                project_id, filepath, exc_info=True,
                            )
        except asyncio.CancelledError:
            pass
        except Exception as e:
            if isinstance(e, UnboundLocalError) and "raw_changes" in str(e):
                pass
            else:
                _logger.error("File watcher error for project=%s", project_id, exc_info=True)

    async def start_watching(self, project_id: str, path: str):
        await self.stop_all()

        if not os.path.exists(path):
            raise ValueError(f"Path does not exist: {path}")

        task = asyncio.create_task(self._watch_loop(project_id, path))
        self._tasks[project_id] = task
        self._watched_paths[project_id] = path

    async def stop_watching(self, project_id: str):
        if project_id in self._tasks:
            self._tasks[project_id].cancel()
            try:
                await self._tasks[project_id]
            except asyncio.CancelledError:
                pass
            del self._tasks[project_id]
            if project_id in self._watched_paths:
                del self._watched_paths[project_id]

    async def stop_all(self):
        project_ids = list(self._tasks.keys())
        for pid in project_ids:
            await self.stop_watching(pid)


file_watcher = FileWatcherService()
