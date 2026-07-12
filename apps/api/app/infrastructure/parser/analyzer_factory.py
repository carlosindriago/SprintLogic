from pathlib import Path

from app.domain.ports.language_analyzer import LanguageAnalyzerStrategy
from app.infrastructure.parser.strategies.python_strategy import PythonAnalyzerStrategy
from app.infrastructure.parser.strategies.typescript_strategy import TypeScriptAnalyzerStrategy


class UnsupportedLanguageError(Exception):
    """Raised when no suitable language analyzer is found for the given project."""
    pass


class AnalyzerFactory:
    """
    Factory to instantiate the correct language analyzer strategy based on the project signature.
    """

    @staticmethod
    def get_analyzer(project_path: Path) -> LanguageAnalyzerStrategy:
        """
        Evaluate the project root directory and return the appropriate strategy.
        """
        # Instantiate available strategies
        typescript_strategy = TypeScriptAnalyzerStrategy()
        python_strategy = PythonAnalyzerStrategy()

        # Check compatibility in order of priority or specific signatures
        if typescript_strategy.is_compatible(project_path):
            return typescript_strategy

        if python_strategy.is_compatible(project_path):
            return python_strategy

        # Default fallback to Python strategy for backwards compatibility
        # with the current ASTParserService that supports multiple languages natively.
        # Once we migrate all languages, we should strictly raise the error.
        return python_strategy
