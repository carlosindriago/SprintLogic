from pydantic import BaseModel, Field


class ProjectProposal(BaseModel):
    """Proposal for a new project/change."""

    change_name: str
    description: str
    objectives: list[str] = Field(default_factory=list)


class TechnicalSpec(BaseModel):
    """Technical specification for the implementation."""

    architecture: str
    dependencies: list[str] = Field(default_factory=list)
    endpoints: list[str] = Field(default_factory=list)


class TaskBreakdown(BaseModel):
    """Breakdown of tasks to implement the spec."""

    tasks: list[str] = Field(default_factory=list)
    estimated_hours: float | None = None
