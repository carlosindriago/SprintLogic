from pydantic import BaseModel, Field


class WBSSubtask(BaseModel):
    id: str = Field(..., description="Unique identifier for the subtask, e.g., '1.1'")
    title: str = Field(..., description="Short title of the subtask")
    description: str = Field(..., description="Detailed description of what needs to be done")
    estimated_hours: float = Field(..., description="Estimated effort in hours")
    dependencies: list[str] = Field(default_factory=list, description="IDs of subtasks that must be completed first")

class WorkPackage(BaseModel):
    id: str = Field(..., description="Unique identifier for the epic/work package, e.g., '1'")
    title: str = Field(..., description="Title of the work package (epic)")
    objective: str = Field(..., description="Main objective of this work package")
    subtasks: list[WBSSubtask] = Field(..., description="Subtasks required to complete this work package")

class WBSHierarchicalResponse(BaseModel):
    work_packages: list[WorkPackage] = Field(..., description="List of epics/work packages")
    total_estimated_hours: float = Field(..., description="Total hours for all work packages combined")
