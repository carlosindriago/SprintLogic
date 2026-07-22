import asyncio
import logging
import os
from pathlib import Path

from app.domain.exceptions import ScannerError
from app.domain.graph_models import NodeLabel
from app.domain.path_validator import PathSecurityValidator
from app.domain.ports.codebase_provider import CodebaseProvider
from app.domain.project import Project
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.events.event_bus import EventBus
from app.infrastructure.git.git_gateway import LocalGitGateway
from app.infrastructure.parser.ast_parser import (
    ASTParserService,
    dedupe_edges,
    extract_nodes_from_code,
    resolve_import_edges,
)

_logger = logging.getLogger(__name__)


class ScanLocalRepository:
    def __init__(self, git_gateway: LocalGitGateway, repository: SQLAlchemyProjectRepository):
        self.git_gateway = git_gateway
        self.repository = repository

    async def execute(self, repo_path: str) -> Project:
        canonical = PathSecurityValidator.validate_project_path(repo_path)

        if not canonical.is_dir():
            raise ValueError(f"Repository path does not exist: {repo_path}")

        try:
            await self.git_gateway.get_recent_commits(str(canonical), limit=1)
        except Exception as e:
            _logger.error(
                "Git operations failed for path=%s: %s",
                repo_path,
                e,
                exc_info=True,
            )
            raise ScannerError(
                f"Git repository scan failed for {repo_path}: {e}",
                repo_path=str(canonical),
            ) from e

        repo_name = canonical.name or os.path.basename(str(canonical))
        project = Project(path=str(canonical), name=repo_name)

        saved_project = await self.repository.save_project(project)
        return saved_project

from uuid import UUID

from app.infrastructure.repositories.graph_repository import SQLAlchemyGraphRepository


class ScanCodebaseUseCase:
    """
    Refactorizado: El Caso de Uso ahora es 100% agnóstico del File System.
    La Inyección de Dependencias elimina el acoplamiento con la infraestructura local.
    """
    def __init__(self, provider: CodebaseProvider, parser: ASTParserService, event_bus: EventBus, graph_repo: SQLAlchemyGraphRepository):
        self.provider = provider
        self.parser = parser
        self.event_bus = event_bus
        self.graph_repo = graph_repo

    async def execute(self, project_id: UUID, cancel_token: asyncio.Event | None = None, project_path: str = ""):
        topic = f"scan:{project_id}"

        try:
            parsed_count = 0
            all_nodes = []
            all_edges = []
            file_imports: dict[str, set[str]] = {}

            extension_filter = ['.ts', '.tsx', '.py', '.java', '.php', '.go', '.html', '.htm', '.css']
            discovered = self.provider.discover(extension_filter)
            total_files = len(discovered)

            await self.event_bus.publish(topic, {
                "type": "discovering",
                "total": total_files,
            })

            birth_dates: dict[str, int] = {}
            if project_path:
                from app.infrastructure.parser.ast_parser import fetch_git_birth_dates
                birth_dates = await fetch_git_birth_dates(project_path)

            async for logical_path, content in self.provider.get_source_files(extension_filter):
                if cancel_token and cancel_token.is_set():
                    _logger.warning(f"Scan aborted by user for project {project_id}")
                    await self.graph_repo.clear_by_project(project_id)
                    return

                parsed_count += 1
                ext = os.path.splitext(logical_path)[1]

                try:
                    nodes, edges, imports = extract_nodes_from_code(
                        project_id, logical_path, content.encode('utf-8'), ext, birth_dates
                    )
                    all_nodes.extend(nodes)
                    all_edges.extend(edges)
                    if imports:
                        file_imports[f"file:{logical_path}"] = imports
                except Exception as e:
                    _logger.error(f"Error parsing {logical_path}: {e}")

                await self.event_bus.publish_throttled(
                    topic=topic,
                    data={
                        "type": "progress",
                        "parsed": parsed_count,
                        "total": total_files,
                        "file": logical_path
                    },
                    throttle_ms=100
                )

                # Force yield to the event loop to keep SSE connection alive
                if parsed_count % 10 == 0:
                    await asyncio.sleep(0)

            base_dir = Path(project_path) if project_path else Path(".")
            file_paths = [n.file_path for n in all_nodes if n.label == NodeLabel.FILE]

            # Run heavy synchronous operations in a thread pool to avoid blocking the event loop
            resolved_edges = await asyncio.to_thread(
                resolve_import_edges, project_id, file_imports, file_paths, base_dir
            )
            all_edges.extend(resolved_edges)

            deduped_edges = await asyncio.to_thread(dedupe_edges, all_edges)

            # Dedupe nodes to avoid IntegrityError (UNIQUE constraint failed)
            seen_nodes = set()
            deduped_nodes = []
            for n in all_nodes:
                if n.id not in seen_nodes:
                    seen_nodes.add(n.id)
                    deduped_nodes.append(n)

            await self.graph_repo.clear_by_project(project_id)
            await self.graph_repo.save_nodes(deduped_nodes)
            await self.graph_repo.save_edges(deduped_edges)

            await self.event_bus.publish_throttled(
                topic=topic,
                data={
                    "type": "completed",
                    "parsed": parsed_count,
                    "total": total_files,
                    "project_id": str(project_id)
                }
            )
        except Exception as e:
            _logger.error(f"Scan failed for project {project_id} with error: {e}", exc_info=True)
            await self.event_bus.publish(topic, {
                "type": "error",
                "message": f"Scan failed: {str(e)}"
            })

