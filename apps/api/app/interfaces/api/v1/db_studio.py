import json
import logging
from datetime import UTC
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models.schema_ir import SchemaIR
from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.db_inspector.env_finder import discover_db_url_from_project
from app.infrastructure.db_inspector.live_extractor import extract_schema_from_live_db
from app.infrastructure.db_inspector.orm_detector import detect_framework
from app.infrastructure.db_inspector.orm_extractor import extract_schema_from_orm
from app.infrastructure.db_inspector.sql_extractor import scan_project_schema
from app.infrastructure.llm.litellm_gateway import LiteLLMGateway
from app.infrastructure.repositories import prompt_repository
from app.infrastructure.repositories.tool_model_repository import (
    resolve_tool_model,
    tool_model_label,
)

logger = logging.getLogger(__name__)

router = APIRouter()


async def resolve_schema(
    project_path: str,
    mode: str = "auto",
    db_url: str | None = None,
    session: AsyncSession | None = None,
) -> SchemaIR:
    """
    Resolves database schema using a 3-Tier Survival Chain:
    Level 1 (Live DB): SQLAlchemy inspector + .env auto-discovery
    Level 2 (ORM Parser): LLM-based parsing of framework ORM/migration source code
    Level 3 (Static SQL): DDL parser of .sql files
    """
    detected_fw = detect_framework(project_path)
    logger.info(
        "[DB Studio] Initiating schema resolution. Path=%s | Mode=%s | Detected Framework=%s",
        project_path,
        mode,
        detected_fw,
    )

    # 1. Level 1: Live DB Connection
    if mode in ("auto", "live"):
        target_url = db_url or discover_db_url_from_project(project_path)
        if target_url:
            try:
                live_schema = extract_schema_from_live_db(target_url)
                if live_schema.tables:
                    live_schema.extraction_level = "live"
                    live_schema.detected_framework = detected_fw
                    logger.info(
                        "[DB Studio] Schema successfully resolved via Level 1 (Live DB). Found %d tables.",
                        len(live_schema.tables),
                    )
                    return live_schema
            except Exception as e:
                logger.info("Live DB extraction failed: %s", e)
                if mode == "live":
                    raise HTTPException(
                        status_code=400, detail="Could not connect to live DB"
                    )

    # 2. Level 2: ORM Parser (LLM)
    if mode in ("auto", "orm"):
        if detected_fw and session:
            try:
                orm_schema = await extract_schema_from_orm(project_path, detected_fw, session)
                if orm_schema.tables:
                    orm_schema.extraction_level = "orm"
                    orm_schema.detected_framework = detected_fw
                    logger.info(
                        "[DB Studio] Schema successfully resolved via Level 2 (ORM Parser LLM - %s). Found %d tables.",
                        detected_fw,
                        len(orm_schema.tables),
                    )
                    return orm_schema
            except Exception as e:
                logger.warning("All LLM fallbacks failed, falling back to Static SQL: %s", e)
                if mode == "orm":
                    return SchemaIR(
                        tables=[],
                        orm_type=detected_fw,
                        extraction_level="orm",
                        detected_framework=detected_fw,
                    )

    # 3. Level 3: Static SQL Scan
    static_schema = scan_project_schema(project_path)
    static_schema.extraction_level = "static"
    static_schema.detected_framework = detected_fw
    logger.info(
        "[DB Studio] Schema resolved via Level 3 (Static SQL Scan). Found %d tables.",
        len(static_schema.tables),
    )
    return static_schema


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
    created_at: str | None = None


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
    project_id: str,
    mode: str = "auto",
    db_url: str | None = None,
    session: AsyncSession = Depends(get_db_session),
) -> SchemaIR:
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    from datetime import datetime

    from app.infrastructure.db_inspector.schema_hasher import calculate_schema_hash

    current_hash = calculate_schema_hash(project.path)

    if project.cached_schema:
        # Load from cache
        try:
            cached_ir = SchemaIR(**project.cached_schema)
            cached_ir.is_outdated = (current_hash != project.schema_hash)
            return cached_ir
        except Exception as e:
            logger.warning("Failed to parse cached schema, will recalculate: %s", e)

    # Recalculate
    schema = await resolve_schema(project.path, mode=mode, db_url=db_url, session=session)

    # Save to DB
    from dataclasses import replace
    project = replace(
        project,
        cached_schema=schema.model_dump(),
        schema_hash=current_hash,
        schema_updated_at=datetime.utcnow()
    )
    await repo.save(project)
    await session.commit()

    schema.is_outdated = False
    return schema


@router.post("/projects/{project_id}/database/schema/rescan", response_model=SchemaIR)
async def rescan_project_database_schema(
    project_id: str,
    mode: str = "auto",
    db_url: str | None = None,
    session: AsyncSession = Depends(get_db_session),
) -> SchemaIR:
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    from datetime import datetime

    from app.infrastructure.db_inspector.schema_hasher import calculate_schema_hash

    current_hash = calculate_schema_hash(project.path)

    schema = await resolve_schema(project.path, mode=mode, db_url=db_url, session=session)

    from dataclasses import replace
    project = replace(
        project,
        cached_schema=schema.model_dump(),
        schema_hash=current_hash,
        schema_updated_at=datetime.utcnow()
    )
    await repo.save(project)
    await session.commit()

    schema.is_outdated = False
    return schema


@router.get("/projects/{project_id}/database/export/sql")
async def export_project_database_schema_sql(
    project_id: str,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.cached_schema:
        schema = SchemaIR(**project.cached_schema)
    else:
        schema = await resolve_schema(project.path, session=session)

    from fastapi.responses import PlainTextResponse

    from app.infrastructure.db_inspector.schema_exporter import export_to_sql

    sql_content = export_to_sql(schema)

    return PlainTextResponse(
        content=sql_content,
        headers={"Content-Disposition": f'attachment; filename="{project.name}_schema.sql"'}
    )


@router.get("/projects/{project_id}/database/export/markdown")
async def export_project_database_schema_markdown(
    project_id: str,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.cached_schema:
        schema = SchemaIR(**project.cached_schema)
    else:
        schema = await resolve_schema(project.path, session=session)

    from fastapi.responses import PlainTextResponse

    from app.infrastructure.db_inspector.schema_exporter import export_to_markdown

    md_content = export_to_markdown(schema)

    return PlainTextResponse(
        content=md_content,
        headers={"Content-Disposition": f'attachment; filename="{project.name}_schema.md"'}
    )

@router.post("/projects/{project_id}/database/audit", response_model=DBAuditResponse)
async def audit_project_database_schema(
    project_id: str,
    payload: SchemaIR | None = None,
    mode: str = "auto",
    db_url: str | None = None,
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

    schema = (
        payload
        if (payload and payload.tables)
        else await resolve_schema(project.path, mode=mode, db_url=db_url, session=session)
    )
    if not schema.tables:
        return DBAuditResponse(
            summary="No tables were found in the project repository or connected database.",
            score=100,
            alerts=[],
            recommendations=["Connect to an active database or add .sql schema files to enable database architecture auditing."],
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
    fallbacks = None
    try:
        provider, model_id, fallbacks = await resolve_tool_model(session, "database_studio")
        resolved_label = tool_model_label(provider, model_id)
        gateway = LiteLLMGateway(model_name=resolved_label)
    except Exception as e:
        logger.warning("Falling back to default gateway model: %s", e)
        gateway = LiteLLMGateway()

    try:
        raw_response = await gateway.generate_completion(formatted_prompt, fallbacks=fallbacks)
    except HTTPException:
        raise
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
        from datetime import datetime

        from app.infrastructure.db.models import AnalysisReportModel

        report_md = format_db_audit_markdown(audit_res)
        now = datetime.now(UTC)
        audit_res.created_at = now.isoformat()

        new_report = AnalysisReportModel(
            id=uuid.uuid4(),
            project_id=project_uuid,
            type="db_audit",
            content=report_md,
            ai_model_version=resolved_label,
            structural_metrics={
                "score": audit_res.score,
                "alerts_count": len(audit_res.alerts),
                "raw_audit": audit_res.model_dump()
            },
            created_at=now
        )
        session.add(new_report)
        await session.commit()
    except Exception as persist_err:
        logger.warning("Failed to persist database audit report: %s", persist_err)

    return audit_res

@router.get("/projects/{project_id}/database/audit/latest", response_model=DBAuditResponse)
async def get_latest_database_audit(
    project_id: str,
    session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    from sqlalchemy import select

    from app.infrastructure.db.models import AnalysisReportModel

    stmt = (
        select(AnalysisReportModel)
        .where(AnalysisReportModel.project_id == project_uuid)
        .where(AnalysisReportModel.type == "db_audit")
        .order_by(AnalysisReportModel.created_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    report = result.scalar_one_or_none()

    if not report or not report.structural_metrics or "raw_audit" not in report.structural_metrics:
        raise HTTPException(status_code=404, detail="No audit history found")

    audit_data = report.structural_metrics["raw_audit"]
    # Ensure created_at is stringified
    if report.created_at:
        audit_data["created_at"] = report.created_at.isoformat()
    return DBAuditResponse.model_validate(audit_data)


@router.post("/projects/{project_id}/database/preview")
async def preview_project_database_schema(
    project_id: str,
    schema: SchemaIR
):
    try:
        UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    from app.infrastructure.db_inspector.schema_exporter import export_to_sql

    sql_content = export_to_sql(schema)
    return {
        "sql": sql_content,
        "orm": "-- ORM generation not yet implemented --\n"
    }


@router.post("/projects/{project_id}/database/apply")
async def apply_project_database_schema(
    project_id: str,
    schema: SchemaIR
):
    try:
        UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    # Simulando escritura en disco
    logger.info("🚀 Aplicando esquema al disco (Simulado) para proyecto %s. %d tablas detectadas.", project_id, len(schema.tables))
    return {"status": "success", "message": "Esquema sincronizado exitosamente (simulado)"}




from pydantic import BaseModel


class SchemaDraftCreate(BaseModel):
    name: str

class SchemaDraftResponse(BaseModel):
    id: str
    project_id: str
    name: str
    created_at: str
    updated_at: str

@router.get("/projects/{project_id}/database/drafts", response_model=list[SchemaDraftResponse])
async def list_schema_drafts(
    project_id: str,
    session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    from sqlalchemy import select

    from app.infrastructure.db.models import SchemaDraftModel

    stmt = (
        select(SchemaDraftModel)
        .where(SchemaDraftModel.project_id == project_uuid)
        .order_by(SchemaDraftModel.created_at.desc())
    )
    result = await session.execute(stmt)
    drafts = result.scalars().all()

    return [
        SchemaDraftResponse(
            id=str(d.id),
            project_id=str(d.project_id),
            name=d.name,
            created_at=d.created_at.isoformat(),
            updated_at=d.updated_at.isoformat()
        ) for d in drafts
    ]

@router.post("/projects/{project_id}/database/drafts", response_model=SchemaDraftResponse)
async def create_schema_draft(
    project_id: str,
    payload: SchemaDraftCreate,
    session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    import uuid
    from datetime import datetime

    from app.infrastructure.db.models import SchemaDraftModel

    now = datetime.now(UTC)
    new_draft = SchemaDraftModel(
        id=uuid.uuid4(),
        project_id=project_uuid,
        name=payload.name,
        schema_data=project.cached_schema,
        created_at=now,
        updated_at=now
    )
    session.add(new_draft)
    await session.commit()

    return SchemaDraftResponse(
        id=str(new_draft.id),
        project_id=str(new_draft.project_id),
        name=new_draft.name,
        created_at=new_draft.created_at.isoformat(),
        updated_at=new_draft.updated_at.isoformat()
    )

@router.put("/projects/{project_id}/database/drafts/{draft_id}")
async def update_schema_draft(
    project_id: str,
    draft_id: str,
    schema: SchemaIR,
    session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
        draft_uuid = UUID(draft_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    from datetime import datetime

    from sqlalchemy import select

    from app.infrastructure.db.models import SchemaDraftModel

    stmt = select(SchemaDraftModel).where(SchemaDraftModel.id == draft_uuid, SchemaDraftModel.project_id == project_uuid)
    result = await session.execute(stmt)
    draft = result.scalar_one_or_none()

    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    draft.schema_data = schema.model_dump()
    draft.updated_at = datetime.now(UTC)
    await session.commit()

    return {"status": "success", "message": "Draft updated"}

@router.delete("/projects/{project_id}/database/drafts/{draft_id}")
async def delete_schema_draft(
    project_id: str,
    draft_id: str,
    session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
        draft_uuid = UUID(draft_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    from sqlalchemy import select

    from app.infrastructure.db.models import SchemaDraftModel

    stmt = select(SchemaDraftModel).where(SchemaDraftModel.id == draft_uuid, SchemaDraftModel.project_id == project_uuid)
    result = await session.execute(stmt)
    draft = result.scalar_one_or_none()

    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    await session.delete(draft)
    await session.commit()

    return {"status": "success", "message": "Draft deleted"}

def lightweight_schema_diff(main_schema: dict, draft_schema: dict) -> str:
    main_tables = {t['name']: t for t in main_schema.get('tables', [])}
    draft_tables = {t['name']: t for t in draft_schema.get('tables', [])}

    added_tables = []
    removed_tables = []
    modified_tables = []

    for tname, tdata in draft_tables.items():
        if tname not in main_tables:
            added_tables.append(tname)
        else:
            main_cols = {c['name']: c for c in main_tables[tname].get('columns', [])}
            draft_cols = {c['name']: c for c in tdata.get('columns', [])}

            added_cols = [c for c in draft_cols if c not in main_cols]
            removed_cols = [c for c in main_cols if c not in draft_cols]

            modifications = []
            if added_cols:
                modifications.append(f"added columns: {added_cols}")
            if removed_cols:
                modifications.append(f"removed columns: {removed_cols}")

            if modifications:
                modified_tables.append(f"{tname} ({'; '.join(modifications)})")

    for tname in main_tables:
        if tname not in draft_tables:
            removed_tables.append(tname)

    lines = []
    if added_tables:
        lines.append(f"Tablas creadas: {', '.join(added_tables)}")
    if removed_tables:
        lines.append(f"Tablas eliminadas: {', '.join(removed_tables)}")
    if modified_tables:
        lines.append(f"Tablas modificadas: {', '.join(modified_tables)}")

    return "\n".join(lines) if lines else "No hay cambios estructurales."

@router.post("/projects/{project_id}/database/drafts/{draft_id}/generate-plan")
async def generate_migration_plan(
    project_id: str,
    draft_id: str,
    session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
        draft_uuid = UUID(draft_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project or not project.cached_schema:
        raise HTTPException(status_code=400, detail="Project schema not found")

    from sqlalchemy import select

    from app.infrastructure.db.models import SchemaDraftModel

    stmt = select(SchemaDraftModel).where(SchemaDraftModel.id == draft_uuid, SchemaDraftModel.project_id == project_uuid)
    result = await session.execute(stmt)
    draft = result.scalar_one_or_none()

    if not draft or not draft.schema_data:
        raise HTTPException(status_code=404, detail="Draft not found")

    diff_string = lightweight_schema_diff(project.cached_schema, draft.schema_data)
    orm_type = project.cached_schema.get('detected_framework', 'SQL')

    prompt = f"""
Eres el COACH IA experto en arquitecturas de bases de datos y migraciones ({orm_type}).
Se te proporcionará un Diff ligero con los cambios que el desarrollador quiere hacer en su base de datos.
Debes crear un PLAN DE MIGRACIÓN paso a paso (Markdown).

CAMBIOS DETECTADOS:
{diff_string}

INSTRUCCIONES:
1. Explica los comandos exactos para generar la migración en {orm_type}.
2. Muestra el código de la migración (up/down).
3. Muestra el código del modelo/entidad actualizado.
"""
    try:
        provider, model_id, fallbacks = await resolve_tool_model(session, "database_studio")
        resolved_label = tool_model_label(provider, model_id)
        gateway = LiteLLMGateway(model_name=resolved_label)
    except Exception:
        gateway = LiteLLMGateway()

    try:
        raw_response = await gateway.generate_completion(prompt, fallbacks=fallbacks if 'fallbacks' in locals() else None)
    except Exception as e:
        logger.error("LLM completion failed for migration plan: %s", e)
        raise HTTPException(status_code=500, detail="Failed to run AI migration plan")

    return {"plan": raw_response}
