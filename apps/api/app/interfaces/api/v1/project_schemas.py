"""
DTOs (Data Transfer Objects) for the Projects API.

These Pydantic models define the public contract of the API surface.
They are the ONLY thing the outside world sees — never domain objects directly.

Design rules:
  - Input DTOs validate and sanitize incoming data.
  - Output DTOs (Response) control exactly what fields are exposed.
  - Domain objects are never returned raw from endpoints.
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

# ── Input DTOs ────────────────────────────────────────────────────────────────

class ScanProjectRequest(BaseModel):
    path: str = Field(..., min_length=1, description="Absolute path to the local repository")


class UpdateProjectRequest(BaseModel):
    name: str | None = Field(None, min_length=1)
    path: str | None = Field(None, min_length=1)


# ── Output DTOs ───────────────────────────────────────────────────────────────

class ProjectResponse(BaseModel):
    """Public representation of a Project. Never exposes internal DB fields."""
    id: UUID
    name: str
    path: str
    last_opened: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]


class ScanStartedResponse(BaseModel):
    status: str
    project_id: UUID
    message: str


class ProjectDeletedResponse(BaseModel):
    status: str


class GraphAnalysisResponse(BaseModel):
    analysis: str
