from datetime import datetime
from uuid import UUID, uuid4

import pytest

from app.domain.project import Project, ProjectStatus

def test_project_status_transitions() -> None:
    assert ProjectStatus.BACKLOG.can_transition_to(ProjectStatus.ACTIVE) is True
    assert ProjectStatus.ACTIVE.can_transition_to(ProjectStatus.COMPLETED) is True
    assert ProjectStatus.ACTIVE.can_transition_to(ProjectStatus.ARCHIVED) is True
    assert ProjectStatus.COMPLETED.can_transition_to(ProjectStatus.ARCHIVED) is True
    assert ProjectStatus.BACKLOG.can_transition_to(ProjectStatus.COMPLETED) is False
    assert ProjectStatus.BACKLOG.can_transition_to(ProjectStatus.ARCHIVED) is True

def test_create_valid_project() -> None:
    project = Project(
        name="Sprint Logic MVP",
        slug="sprint-logic-mvp",
        
    )
    
    assert isinstance(project.id, UUID)
    assert project.name == "Sprint Logic MVP"
    assert project.slug == "sprint-logic-mvp"
    assert project.status == ProjectStatus.BACKLOG
    assert isinstance(project.created_at, datetime)

@pytest.mark.parametrize("invalid_name", ["", "   "])
def test_create_project_empty_name(invalid_name: str) -> None:
    with pytest.raises(ValueError, match="Project name cannot be empty"):
        Project(name=invalid_name, slug="slug")

@pytest.mark.parametrize("invalid_slug", ["", "   ", "Invalid Slug!", "not_allowed", "-start-with-hyphen"])
def test_create_project_invalid_slug(invalid_slug: str) -> None:
    with pytest.raises(ValueError, match="Project slug must be alphanumeric with hyphens"):
        Project(name="Name", slug=invalid_slug)
