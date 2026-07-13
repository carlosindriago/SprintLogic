import logging
import uuid
from pathlib import Path
from typing import Any

from app.domain.ports.language_analyzer import LanguageAnalyzerStrategy

# Nota: Temporalmente importaremos los servicios actuales hasta que migremos
# completamente la lógica aquí.
from app.infrastructure.parser.ast_parser import ASTParserService

logger = logging.getLogger(__name__)


class PythonAnalyzerStrategy(LanguageAnalyzerStrategy):
    """
    Strategy to parse Python projects using the native Tree-Sitter AST parser.
    """

    def is_compatible(self, project_path: Path) -> bool:
        """
        Compatible if it contains requirements.txt or pyproject.toml
        """
        return (project_path / "requirements.txt").exists() or (project_path / "pyproject.toml").exists()

    async def parse_dependencies(self, project_path: Path) -> dict[str, Any]:
        """
        Uses the existing ASTParserService to parse the Python directory.
        Returns the data in the standardized {"nodes": [], "edges": []} format.
        """
        logger.info(f"Iniciando análisis nativo de Python en: {project_path}")

        # En el futuro, el ID del proyecto se manejará en una capa superior o de dominio,
        # para propósitos de retrocompatibilidad con el parser actual, usamos un dummy UUID.
        # Eventualmente ast_parser.py se mudará íntegramente aquí y no dependerá de UUIDs de base de datos
        # en la fase de extracción.
        dummy_project_id = uuid.uuid4()

        parser_service = ASTParserService()
        try:
            # parse_directory is synchronous in ASTParserService currently.
            # In a real environment, we'd wrap this in asyncio.to_thread to avoid blocking,
            # or refactor the inner logic to be async.
            nodes, edges = parser_service.parse_directory(dummy_project_id, str(project_path))

            # Convert GraphNode and GraphEdge models to dicts to match the Strategy contract
            nodes_dict = [n.model_dump() if hasattr(n, 'model_dump') else n.__dict__ for n in nodes]
            edges_dict = [e.model_dump() if hasattr(e, 'model_dump') else e.__dict__ for e in edges]

            return {
                "nodes": nodes_dict,
                "edges": edges_dict
            }
        except Exception as e:
            logger.error(f"Error parseando proyecto Python: {e}")
            return {"nodes": [], "edges": []}

    def __init__(self) -> None:
        import tree_sitter_python
        from tree_sitter import Language, Parser
        self.py_language = Language(tree_sitter_python.language())
        self.parser = Parser(self.py_language)
