from pydantic import BaseModel, Field


class WBSSubtask(BaseModel):
    id: str = Field(..., description="Unique identifier for the subtask, e.g., '1.1'")
    title: str = Field(..., description="Short title of the subtask")
    description: str | None = Field(default="", description="Detailed technical explanation")
    type: str | None = Field(
        default="Feature",
        description="Ticket type: 'Feature' | 'Refactor' | 'Technical Debt' | 'Security'",
    )
    priority: str | None = Field(
        default="Medium", description="Priority: 'High' | 'Medium' | 'Low'"
    )
    epic: str | None = Field(
        default=None, description="Epic name (e.g. 'Autenticación y Sesiones')"
    )
    sprint: str | None = Field(
        default="Sprint 1", description="Assigned Sprint (e.g. 'Sprint 1', 'Backlog')"
    )
    branch_name: str | None = Field(
        default=None, description="Suggested git branch name (e.g. 'feature/sl-101-user-model')"
    )
    subtasks: list[dict] = Field(
        default_factory=list,
        description="Checklist steps e.g. [{'title': 'Step 1', 'completed': False}]",
    )
    estimated_hours: float | None = Field(default=1.0, description="Estimated effort in hours")
    dependencies: list[str] = Field(
        default_factory=list, description="IDs of subtasks that must be completed first"
    )


class WorkPackage(BaseModel):
    id: str = Field(..., description="Unique identifier for the epic/work package, e.g., '1'")
    title: str = Field(..., description="Title of the work package (epic)")
    objective: str | None = Field(default="", description="Main objective of this work package")
    epic: str | None = Field(default=None, description="Epic name")
    sprint: str | None = Field(default="Sprint 1", description="Sprint assignment")
    subtasks: list[WBSSubtask] = Field(
        ..., description="Subtasks required to complete this work package"
    )


class WBSHierarchicalResponse(BaseModel):
    work_packages: list[WorkPackage] = Field(..., description="List of epics/work packages")
    total_estimated_hours: float = Field(
        ..., description="Total hours for all work packages combined"
    )
