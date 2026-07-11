import logging
from pathlib import Path
from typing import Any

from app.domain.ports.language_analyzer import LanguageAnalyzerStrategy
# Nota: Temporalmente importaremos los servicios actuales hasta que migremos
# completamente la lógica aquí.
from app.infrastructure.parser.ast_parser import ASTParserService
import uuid

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

    async def parse_skeletons(self, project_path: Path, relative_paths: list[str]) -> dict[str, Any]:
        """
        Extract signatures and structures from Python files.
        """
        from app.infrastructure.parser.ast_parser import extract_nodes_from_code
        from app.domain.graph_models import NodeLabel
        import uuid
        
        skeletons = {}
        for file_rel_path in relative_paths:
            clean_path = file_rel_path.replace("file:", "")
            file_abs_path = project_path / clean_path
            if not file_abs_path.is_file():
                continue
                
            try:
                with open(file_abs_path, "rb") as f:
                    code = f.read()
                
                nodes, _, imports = extract_nodes_from_code(
                    uuid.uuid4(), str(file_abs_path), code, ".py"
                )
                
                classes = [n.name for n in nodes if n.label == NodeLabel.CLASS]
                functions = [n.name for n in nodes if n.label == NodeLabel.FUNCTION]
                
                code_str = code.decode("utf-8", errors="replace")
                
                skeletons[file_rel_path] = {
                    "imports": list(imports),
                    "classes": classes,
                    "functions": functions,
                    "full_text": code_str if len(code_str) < 2000 else "Archivo muy largo, solo se muestra estructura."
                }
            except Exception as e:
                logger.error(f"Error extrayendo esqueleto Python para {file_rel_path}: {e}")
                
        return skeletons
