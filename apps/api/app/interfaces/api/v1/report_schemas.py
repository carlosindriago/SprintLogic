from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class StructuralAnomalyReport(BaseModel):
    cyclic_dependencies: list[list[str]]
    god_objects_in: list[dict]
    god_objects_out: list[dict]
    isolated_components: int


class AnalysisReportResponse(BaseModel):
    """
    DTO for a single AI analysis report.
    """
    id: UUID = Field(..., description="Unique identifier for the report")
    project_id: UUID = Field(..., description="The project this report belongs to")
    content: str = Field(..., description="The markdown content of the AI report")
    ai_model_version: str = Field(..., description="The AI model that generated this report")
    structural_metrics: dict | None = Field(None, description="Deterministic graph metrics computed via NetworkX")
    created_at: datetime = Field(..., description="Timestamp when the report was created")

    class Config:
        from_attributes = True


class AnalysisReportListResponse(BaseModel):
    """
    DTO for listing AI analysis reports for a project.
    Contains less data (e.g., omits full content or truncates it) if needed,
    but for now we return the full objects or a summary.
    """
    reports: list[AnalysisReportResponse]
