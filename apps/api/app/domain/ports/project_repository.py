"""
Port (Interface): Abstract contract for any Project persistence mechanism.

The Domain layer defines WHAT operations are needed.
It must never know HOW they are implemented (SQLAlchemy, in-memory, HTTP, etc.).
"""
from abc import ABC, abstractmethod
from uuid import UUID

from app.domain.project import Project


class ProjectRepository(ABC):
    """
    Repository port for Project aggregate persistence.
    All methods work exclusively with domain objects — never with ORM models.
    """

    @abstractmethod
    async def save(self, project: Project) -> Project:
        """
        Persist a new project and return the saved domain object.
        Raises ValueError if a project with the same path already exists.
        """
        ...

    @abstractmethod
    async def get_by_id(self, project_id: UUID) -> Project | None:
        """Return the project with the given ID, or None if not found."""
        ...

    @abstractmethod
    async def get_by_path(self, path: str) -> Project | None:
        """Return the project with the given path, or None if not found."""
        ...

    @abstractmethod
    async def get_all(self) -> list[Project]:
        """Return all projects ordered by last_opened descending (nulls last)."""
        ...

    @abstractmethod
    async def update(
        self,
        project_id: UUID,
        *,
        name: str | None = None,
        path: str | None = None,
    ) -> Project | None:
        """
        Partially update a project's mutable fields.
        Returns the updated domain object, or None if the project does not exist.
        """
        ...

    @abstractmethod
    async def touch_last_opened(self, project_id: UUID) -> None:
        """Update the last_opened timestamp to now (UTC). No-op if not found."""
        ...

    @abstractmethod
    async def delete(self, project_id: UUID) -> bool:
        """
        Delete a project and its associated graph data.
        Returns True if the project existed and was deleted, False otherwise.
        """
        ...
