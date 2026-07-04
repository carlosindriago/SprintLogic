import pytest

from app.domain.project import Project


def test_create_valid_project():
    project = Project(name="My Project", path="/tmp/project")
    assert project.name == "My Project"
    assert project.path == "/tmp/project"

def test_create_project_empty_name_raises_error():
    with pytest.raises(ValueError, match="Project name cannot be empty"):
        Project(name="", path="/tmp/project")

def test_create_project_empty_path_raises_error():
    with pytest.raises(ValueError, match="Project path cannot be empty"):
        Project(name="My Project", path="")
