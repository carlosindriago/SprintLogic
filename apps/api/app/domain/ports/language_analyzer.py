from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any


class LanguageAnalyzerStrategy(ABC):
    """
    Abstract port representing a strategy to parse a specific programming language.
    """

    @abstractmethod
    def is_compatible(self, project_path: Path) -> bool:
        """
        Evaluate if this strategy is capable of parsing the given project.
        """
        pass

    @abstractmethod
    async def parse_dependencies(self, project_path: Path) -> dict[str, Any]:
        """
        Parse the project and return a dictionary representing the dependency graph.
        Expected format: {"nodes": [...], "edges": [...]}
        """
        pass

    @abstractmethod
    async def parse_skeletons(self, project_path: Path, relative_paths: list[str]) -> dict[str, Any]:
        """
        Extract skeletons (imports, classes, functions, and short full text) for the target files.
        """
        pass
