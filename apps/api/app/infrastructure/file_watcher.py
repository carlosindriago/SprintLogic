import asyncio
import os
import hashlib
from typing import Callable, Awaitable, Dict, Set
from watchfiles import awatch, Change

class FileWatcherService:
    """Service for watching file changes in a project."""
    
    def __init__(self):
        self._tasks: Dict[str, asyncio.Task] = {}
        self._watched_paths: Dict[str, str] = {}
        # Stores the hash of tasks.md to prevent infinite loops when written by the backend
        self._backend_writes: Dict[str, str] = {}
        # Callbacks for specific events
        self._on_change_callbacks: list[Callable[[str, Change, str], Awaitable[None]]] = []

    def add_callback(self, callback: Callable[[str, Change, str], Awaitable[None]]):
        self._on_change_callbacks.append(callback)

    def mark_backend_write(self, filepath: str, content: str):
        """Marks that the backend wrote to this file to ignore the next watch event."""
        # Store a hash of the content that we just wrote
        content_hash = hashlib.md5(content.encode()).hexdigest()
        self._backend_writes[filepath] = content_hash

    async def _watch_loop(self, project_id: str, path: str):
        try:
            async for changes in awatch(path, step=500):
                for change, filepath in changes:
                    # Ignore .git and node_modules
                    if ".git/" in filepath or "node_modules/" in filepath:
                        continue

                    # Prevent infinite loop for files modified by our own backend
                    if filepath in self._backend_writes:
                        try:
                            with open(filepath, "r", encoding="utf-8") as f:
                                current_content = f.read()
                            current_hash = hashlib.md5(current_content.encode()).hexdigest()
                            
                            if current_hash == self._backend_writes[filepath]:
                                # This change was caused by our backend write, ignore it
                                del self._backend_writes[filepath]
                                continue
                        except Exception:
                            pass

                    # Notify callbacks
                    for callback in self._on_change_callbacks:
                        try:
                            await callback(project_id, change, filepath)
                        except Exception as e:
                            print(f"Error in watcher callback: {e}")
        except asyncio.CancelledError:
            pass

    async def start_watching(self, project_id: str, path: str):
        """Starts watching a project path. Stops the previous watcher if project changed."""
        # Since we only watch the "active" project from UI, we can cancel old watchers
        # Or we can allow multiple. The requirement says: 
        # "El backend solo vigila el path del proyecto que el frontend tiene activo en ese momento. Si se cambia de proyecto, se reinicia el watcher con la nueva ruta."
        
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
