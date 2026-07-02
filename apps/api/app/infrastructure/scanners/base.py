from abc import ABC, abstractmethod
from typing import Any


class ProjectScanner(ABC):
    """Abstract strategy for multi-language static analysis.

    Each concrete scanner (Python/Ruff, Node/ESLint, Go/staticcheck, etc.)
    inherits from this class and implements `scan()`.

    The returned dict maps absolute file paths to a list of marker dicts
    compatible with Monaco's IMarkerData shape:
        {
          "/absolute/path/to/file.py": [
            {"line": 10, "column": 5, "message": "...", "severity": 8},
            ...
          ]
        }
    """

    @abstractmethod
    def scan(self, project_path: str) -> dict[str, list[dict[str, Any]]]:
        """Run the linter against the project and return markers per file.

        Args:
            project_path: Absolute path to the project root.

        Returns:
            Dict mapping absolute file path → list of marker objects.
        """
        ...
