import logging
import os

from app.domain.exceptions import ScannerError
from app.domain.path_validator import PathSecurityValidator
from app.domain.project import Project
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.git.git_gateway import LocalGitGateway

from app.domain.ports.codebase_provider import CodebaseProvider
from app.infrastructure.parser.ast_parser import ASTParserService
from app.infrastructure.events.event_bus import EventBus
from app.infrastructure.parser.ast_parser import extract_nodes_from_code

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

class ScanCodebaseUseCase:
    """
    Refactorizado: El Caso de Uso ahora es 100% agnóstico del File System.
    La Inyección de Dependencias elimina el acoplamiento con la infraestructura local.
    """
    def __init__(self, provider: CodebaseProvider, parser: ASTParserService, event_bus: EventBus):
        self.provider = provider
        self.parser = parser
        self.event_bus = event_bus

    async def execute(self, project_id: str):
        topic = f"scan:{project_id}"
        parsed_count = 0
        
        # Ahora iteramos asíncronamente sin bloquear el Event Loop (ASGI)
        async for logical_path, content in self.provider.get_source_files(['.ts', '.tsx', '.py']):
            parsed_count += 1
            
            # El Caso de Uso (el Arquitecto) toma el control directo del ritmo.
            # ast_tree = extract_nodes_from_code(project_id, logical_path, content.encode('utf-8'), ext)
            
            await self.event_bus.publish_throttled(
                topic=topic,
                data={
                    "type": "progress",
                    "parsed": parsed_count,
                    "file": logical_path
                },
                throttle_ms=100
            )
            
        # Forzamos la emisión final de completion
        await self.event_bus.publish_throttled(
            topic=topic,
            data={
                "type": "completed",
                "parsed": parsed_count,
                "project_id": project_id
            }
        )
