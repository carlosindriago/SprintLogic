from pydantic import BaseModel, Field
from typing import List, Optional

class ProjectProposal(BaseModel):
    """Proposal for a new project/change."""
    change_name: str
    description: str
    objectives: List[str] = Field(default_factory=list)

class TechnicalSpec(BaseModel):
    """Technical specification for the implementation."""
    architecture: str
    dependencies: List[str] = Field(default_factory=list)
    endpoints: List[str] = Field(default_factory=list)

class TaskBreakdown(BaseModel):
    """Breakdown of tasks to implement the spec."""
    tasks: List[str] = Field(default_factory=list)
    estimated_hours: Optional[float] = None
