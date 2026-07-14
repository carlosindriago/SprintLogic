import asyncio
import hashlib
import logging
import os
from collections.abc import Awaitable, Callable

from watchfiles import Change, awatch

_logger = logging.getLogger(__name__)


class FileWatcherService:
    def __init__(self):
        self._tasks: dict[str, list[asyncio.Task]] = {}
        self._queues: dict[str, asyncio.Queue] = {}
        self._watched_paths: dict[str, str] = {}
        self._backend_writes: dict[str, str] = {}
        self._on_change_callbacks: list[Callable[[str, Change, str], Awaitable[None]]] = []

    def add_callback(self, callback: Callable[[str, Change, str], Awaitable[None]]):
        self._on_change_callbacks.append(callback)

    def mark_backend_write(self, filepath: str, content: str):
        content_hash = hashlib.md5(content.encode()).hexdigest()
        self._backend_writes[filepath] = content_hash

    async def trigger_tactical_sync(self, project_id: str, batch: set[str]):
        _logger.info(
            f"[Watchdog] Tactical Sync (Incremental): {len(batch)} files in project {project_id}"
        )

        import uuid

        from sqlalchemy import delete, select

        from app.infrastructure.db.database import AsyncSessionLocal
        from app.infrastructure.db.models import ASTNodeMapModel
        from app.infrastructure.parser.ast_parser import TreeSitterParser

        parser = TreeSitterParser()
        project_uuid = uuid.UUID(project_id)

        # 1. MISE EN PLACE: Preparación (Fuera de la transacción. Cero candados).
        parsed_data = {}
        for filepath in batch:
            try:
                with open(filepath, encoding="utf-8") as f:
                    code = f.read()
                nodes, _ = parser.parse_code(code, filepath)
                parsed_data[filepath] = {n.fqn: n for n in nodes}
            except FileNotFoundError:
                parsed_data[filepath] = {}  # Archivo borrado, purgará todo
            except Exception:
                continue  # Ignorar archivos no parseables

        # 2. EJECUCIÓN: Transacción relámpago
        async with AsyncSessionLocal() as session:
            pass

            async with session.begin():
                for filepath, current_fqns in parsed_data.items():
                    # Leer estado de la BD
                    stmt = select(ASTNodeMapModel).where(
                        ASTNodeMapModel.project_id == project_uuid,
                        ASTNodeMapModel.file_path == filepath,
                    )
                    db_nodes = (await session.execute(stmt)).scalars().all()
                    db_fqns = {n.fqn: n.node_hash for n in db_nodes}

                    # Set Difference (Nodos Huérfanos)
                    deleted_fqns = list(set(db_fqns.keys()) - set(current_fqns.keys()))

                    if deleted_fqns:
                        # Chunking
                        for i in range(0, len(deleted_fqns), 500):
                            chunk = deleted_fqns[i : i + 500]
                            await session.execute(
                                delete(ASTNodeMapModel).where(
                                    ASTNodeMapModel.project_id == project_uuid,
                                    ASTNodeMapModel.file_path == filepath,
                                    ASTNodeMapModel.fqn.in_(chunk),
                                )
                            )

                    # Inserción y Actualización (Upsert lógico)
                    for fqn, node in current_fqns.items():
                        if fqn in db_fqns and db_fqns[fqn] == node.hash:
                            continue

                        if fqn not in db_fqns:
                            new_map = ASTNodeMapModel(
                                project_id=project_uuid,
                                file_path=filepath,
                                fqn=fqn,
                                node_hash=node.hash,
                            )
                            session.add(new_map)
                        else:
                            stmt_update = select(ASTNodeMapModel).where(
                                ASTNodeMapModel.project_id == project_uuid,
                                ASTNodeMapModel.file_path == filepath,
                                ASTNodeMapModel.fqn == fqn,
                            )
                            existing_map = (await session.execute(stmt_update)).scalar_one_or_none()
                            if existing_map:
                                existing_map.node_hash = node.hash

    async def trigger_bulk_sync(self, project_id: str, batch: set[str]):
        _logger.info(f"[Watchdog] Tsunami Sync (Bulk): {len(batch)} files in project {project_id}")
        # TODO: Implement CAS Bulk Sync

    async def _vector_sync_worker(self, project_id: str):
        queue = self._queues.get(project_id)
        if not queue:
            return

        batch = set()
        while True:
            try:
                change_item = await asyncio.wait_for(queue.get(), timeout=2.0)
                change, filepath = change_item

                # Forward to UI/SSE callbacks
                for callback in self._on_change_callbacks:
                    try:
                        await callback(project_id, change, filepath)
                    except Exception:
                        _logger.error(
                            "Error in watcher callback for project=%s file=%s",
                            project_id,
                            filepath,
                            exc_info=True,
                        )

                batch.add(filepath)
                queue.task_done()

                if len(batch) >= 100:
                    await self.trigger_bulk_sync(project_id, batch)
                    batch.clear()

            except TimeoutError:
                if batch:
                    if len(batch) <= 5:
                        await self.trigger_tactical_sync(project_id, batch)
                    else:
                        await self.trigger_bulk_sync(project_id, batch)
                    batch.clear()
            except asyncio.CancelledError:
                break
            except Exception:
                _logger.error(
                    "Error in vector_sync_worker for project=%s", project_id, exc_info=True
                )

    async def _watch_loop(self, project_id: str, path: str):
        queue = self._queues.get(project_id)
        if not queue:
            return

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

                    # Productor: Empujar a la cola atómicamente
                    queue.put_nowait((change, filepath))

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

        queue: asyncio.Queue = asyncio.Queue()
        self._queues[project_id] = queue

        watch_task = asyncio.create_task(self._watch_loop(project_id, path))
        worker_task = asyncio.create_task(self._vector_sync_worker(project_id))

        self._tasks[project_id] = [watch_task, worker_task]
        self._watched_paths[project_id] = path

    async def stop_watching(self, project_id: str):
        if project_id in self._tasks:
            tasks = self._tasks[project_id]
            for task in tasks:
                task.cancel()

            for task in tasks:
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            del self._tasks[project_id]

            if project_id in self._queues:
                del self._queues[project_id]

            if project_id in self._watched_paths:
                del self._watched_paths[project_id]

    async def stop_all(self):
        project_ids = list(self._tasks.keys())
        for pid in project_ids:
            await self.stop_watching(pid)


file_watcher = FileWatcherService()
