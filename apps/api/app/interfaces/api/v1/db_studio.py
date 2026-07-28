import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models.schema_ir import SchemaIR
from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.db_inspector.sql_extractor import scan_project_schema
from app.infrastructure.llm.litellm_gateway import LiteLLMGateway
from app.infrastructure.repositories import prompt_repository
from app.infrastructure.repositories.tool_model_repository import (
    resolve_tool_model,
    tool_model_label,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class DBAuditAlert(BaseModel):
    severity: str = "warning"
    title: str
    table: str = "general"
    description: str
    migration_suggestion: str | None = None


class DBAuditResponse(BaseModel):
    summary: str
    score: int = 100
    alerts: list[DBAuditAlert] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


def format_db_audit_markdown(audit: DBAuditResponse) -> str:
    lines = [
        "# 🗄️ Auditoría de Arquitectura de Base de Datos",
        f"**Score de Salud**: `{audit.score}/100`\n",
        f"## Resumen Ejecutivo\n{audit.summary}\n",
    ]
    if audit.alerts:
        lines.append(f"## Alertas y Riesgos ({len(audit.alerts)})\n")
        for alert in audit.alerts:
            lines.append(f"### {alert.title}")
            lines.append(f"- **Tabla**: `{alert.table}`")
            lines.append(f"- **Severidad**: `{alert.severity.upper()}`\n")
            lines.append(f"{alert.description}\n")
            if alert.migration_suggestion:
                lines.append("```sql")
                lines.append(alert.migration_suggestion)
                lines.append("```\n")
    if audit.recommendations:
        lines.append("## Recomendaciones\n")
        for rec in audit.recommendations:
            lines.append(f"- {rec}")
    return "\n".join(lines)


@router.get("/projects/{project_id}/database/schema", response_model=SchemaIR)
async def get_project_database_schema(
    project_id: str, session: AsyncSession = Depends(get_db_session)
) -> SchemaIR:
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    schema = scan_project_schema(project.path)
    return schema


@router.post("/projects/{project_id}/database/audit", response_model=DBAuditResponse)
async def audit_project_database_schema(
    project_id: str,
    payload: SchemaIR | None = None,
    session: AsyncSession = Depends(get_db_session),
) -> DBAuditResponse:
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    schema = payload if (payload and payload.tables) else scan_project_schema(project.path)
    if not schema.tables:
        return DBAuditResponse(
            summary="No SQL tables were found in the scanned project repository.",
            score=100,
            alerts=[],
            recommendations=["Add .sql schema or migration files to enable database architecture auditing."],
        )

    prompt_model = await prompt_repository.get_prompt_async(
        session, prompt_repository.DB_ARCHITECT_AUDITOR_ID
    )
    prompt_template = (
        prompt_model.content
        if prompt_model
        else prompt_repository.DB_ARCHITECT_AUDITOR_CONTENT
    )

    schema_json_str = schema.model_dump_json(indent=2)
    formatted_prompt = prompt_template.replace("{schema_json}", schema_json_str)

    resolved_label = "default"
    try:
        provider, model_id = await resolve_tool_model(session, "database_studio")
        resolved_label = tool_model_label(provider, model_id)
        gateway = LiteLLMGateway(model_name=resolved_label)
    except Exception as e:
        logger.warning("Falling back to default gateway model: %s", e)
        gateway = LiteLLMGateway()

    try:
        raw_response = await gateway.generate_completion(formatted_prompt)
    except Exception as e:
        logger.error("LLM completion failed for database audit: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to run AI database audit")

    cleaned = raw_response.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("\n", 1)[0]
    cleaned = cleaned.strip()

    try:
        parsed_dict = json.loads(cleaned)
        audit_res = DBAuditResponse.model_validate(parsed_dict)
    except Exception as parse_err:
        logger.warning("Failed to parse LLM JSON response for DB audit: %s", parse_err)
        audit_res = DBAuditResponse(
            summary=cleaned[:300] if cleaned else "Audit completed.",
            score=70,
            alerts=[
                DBAuditAlert(
                    severity="info",
                    title="Audit Raw Output",
                    table="general",
                    description=cleaned,
                )
            ],
            recommendations=[],
        )

    # Persist report in AnalysisReportModel with type="db_audit"
    try:
        import uuid

        from app.infrastructure.db.models import AnalysisReportModel

        report_md = format_db_audit_markdown(audit_res)
        new_report = AnalysisReportModel(
            id=uuid.uuid4(),
            project_id=project_uuid,
            type="db_audit",
            content=report_md,
            ai_model_version=resolved_label,
            structural_metrics={"score": audit_res.score, "alerts_count": len(audit_res.alerts)}
        )
        session.add(new_report)
        await session.commit()
    except Exception as persist_err:
        logger.error("Failed to persist DB audit report: %s", persist_err, exc_info=True)

    return audit_res
