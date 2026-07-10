"""
Port (Interface): Abstract contract for any source of code files.
The Application layer is completely decoupled from the physical source.
"""
from abc import ABC, abstractmethod
from typing import AsyncIterator, Tuple


class CodebaseProvider(ABC):
    """
    Defines the contract that any codebase source adapter must fulfill.
    The Application layer ignores whether code comes from disk, network, or memory.
    """

    @abstractmethod
    async def get_source_files(
        self, extension_filter: list[str] | None = None
    ) -> AsyncIterator[Tuple[str, str]]:
        """
        Yields tuples of (logical_file_path, plain_text_content).
        Must be an async generator to avoid blocking the ASGI event loop.
        """
        ...
