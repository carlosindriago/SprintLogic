from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from pathlib import Path


class CodebaseProvider(ABC):
    """
    Defines the contract that any codebase source adapter must fulfill.
    The Application layer ignores whether code comes from disk, network, or memory.
    """

    @abstractmethod
    def discover(self, extension_filter: list[str] | None = None) -> list[Path]:
        """
        Returns the full list of candidate file paths synchronously (no file I/O).
        Call this first to learn the total count before streaming content.
        """
        ...

    @abstractmethod
    async def get_source_files(
        self, extension_filter: list[str] | None = None
    ) -> AsyncIterator[tuple[str, str]]:
        """
        Yields tuples of (logical_file_path, plain_text_content).
        Must be an async generator to avoid blocking the ASGI event loop.
        """
        ...
