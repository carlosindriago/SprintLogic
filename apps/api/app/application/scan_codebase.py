from uuid import UUID

from app.domain.graph_repository import GraphRepository
from app.infrastructure.parser.ast_parser import ASTParserService


class ScanCodebaseUseCase:
    def __init__(self, parser: ASTParserService, repository: GraphRepository):
        self.parser = parser
        self.repository = repository

    async def execute(self, project_id: UUID, directory_path: str) -> None:
        nodes, edges = self.parser.parse_directory(project_id, directory_path)

        await self.repository.clear_by_project(project_id)
        await self.repository.save_nodes(nodes)
        await self.repository.save_edges(edges)
