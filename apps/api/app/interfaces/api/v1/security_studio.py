"""Security Studio API Router (SAST + AI Judge).

Handles project vulnerability scans (Semgrep, Gitleaks) and probabilistic
evaluation via the AI Security Judge.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.llm.litellm_gateway import LiteLLMGateway
from app.infrastructure.repositories import prompt_repository
from app.infrastructure.repositories.tool_model_repository import (
    resolve_tool_model,
    tool_model_label,
)
from app.infrastructure.security.sast_runner import SecurityEngine, SecurityFinding
from app.infrastructure.security.toolchain import global_toolchain

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/security", tags=["Security Studio"])


class FindingEvaluationRequest(BaseModel):
    finding_id: str
    tool: str = "semgrep"
    rule_id: str = ""
    file_path: str
    line_number: int = 1
    severity: str = "medium"
    cwe: str | None = None
    finding_description: str = ""
    source_code: str | None = None
    topological_context: str | None = None


class FindingEvaluationResponse(BaseModel):
    finding_id: str
    is_real_threat: bool
    confidence_score: float = Field(ge=0.0, le=100.0)
    mitigation_diff: str
    explanation: str
    model_used: str


def _clean_json_response(raw_text: str) -> dict[str, Any]:
    """Clean markdown json wrappers and parse response safely."""
    cleaned = raw_text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if match:
        cleaned = match.group(1).strip()
    try:
        return json.loads(cleaned)  # type: ignore[no-any-return]
    except Exception:
        # Fallback heuristic if not strict JSON
        is_threat = "false" not in cleaned.lower() and "falso positivo" not in cleaned.lower()
        return {
            "is_real_threat": is_threat,
            "confidence_score": 85.0 if is_threat else 30.0,
            "mitigation_diff": "--- a/" + "\n+++ b/" + "\n@@ -1 +1 @@\n-# Código vulnerable\n+# Código saneado",
            "explanation": cleaned or "Evaluación heurística completada por el Juez de Seguridad.",
        }


@router.get("/toolchain/status")
async def get_toolchain_status(
    project_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """Get current status of native security binary toolchain (Gitleaks, Semgrep)."""
    return {
        "status": "success",
        "project_id": project_id,
        "toolchain": global_toolchain.get_status(),
    }


@router.post("/scan")
async def scan_project_security(
    project_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """Run full SAST & Secret scan across the project directory."""
    repo = SQLAlchemyProjectRepository(session)
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id format")

    project = await repo.get_by_id(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not os.path.exists(project.path):
        raise HTTPException(status_code=400, detail=f"Project path does not exist: {project.path}")

    engine = SecurityEngine(project.path)
    findings: list[SecurityFinding] = await engine.run_full_scan()

    counts = {
        "critical": sum(1 for f in findings if f.severity == "critical"),
        "high": sum(1 for f in findings if f.severity == "high"),
        "medium": sum(1 for f in findings if f.severity == "medium"),
        "low": sum(1 for f in findings if f.severity == "low"),
        "total": len(findings),
    }

    return {
        "status": "success",
        "project_id": project_id,
        "counts": counts,
        "findings": [f.to_dict() for f in findings],
        "toolchain": global_toolchain.get_status(),
    }


@router.post("/evaluate", response_model=FindingEvaluationResponse)
async def evaluate_finding(
    project_id: str,
    request: FindingEvaluationRequest,
    session: AsyncSession = Depends(get_db_session),
) -> FindingEvaluationResponse:
    """Evaluate a SAST finding probabilistically using the AI Security Judge."""
    repo = SQLAlchemyProjectRepository(session)
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id format")

    project = await repo.get_by_id(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Read source code from disk if not provided
    source_code = request.source_code
    if not source_code and request.file_path:
        full_file_path = os.path.join(project.path, request.file_path)
        if os.path.isfile(full_file_path):
            try:
                with open(full_file_path, encoding="utf-8", errors="ignore") as f:
                    source_code = f.read()
            except Exception as e:
                logger.warning("Could not read file %s: %s", full_file_path, e)
                source_code = f"# Error leyendo archivo en disco: {e}"

    if not source_code:
        source_code = f"# Archivo: {request.file_path}\n# Línea: {request.line_number}\n# Regla: {request.rule_id}"

    # Load dynamic prompt from Prompt Registry (Zero Hardcoding)
    prompt_record = await prompt_repository.get_prompt_async(
        session, prompt_repository.SECURITY_JUDGE_PROMPT_ID
    )
    prompt_template = (
        prompt_record.content
        if prompt_record
        else prompt_repository.SECURITY_JUDGE_PROMPT_CONTENT
    )

    topological_context = (
        request.topological_context
        or f"Proyecto: {project.name}\nArchivo objetivo: {request.file_path}\nHerramienta detectora: {request.tool}"
    )

    rendered_prompt = prompt_template.format(
        tool=request.tool,
        rule_id=request.rule_id,
        file_path=request.file_path,
        line_number=request.line_number,
        severity=request.severity,
        cwe=request.cwe or "CWE-Desconocido",
        finding_description=request.finding_description,
        source_code=source_code,
        topological_context=topological_context,
    )

    # Dynamic model resolution for 'security_studio' tool mapping
    provider_id, model_name, fallbacks = await resolve_tool_model(session, "security_studio")
    active_model_label = tool_model_label(provider_id, model_name)
    gateway = LiteLLMGateway(model_name=active_model_label)

    try:
        raw_response = await gateway.generate_completion(
            prompt=rendered_prompt,
            lang_code="es",
            fallbacks=fallbacks,
        )
        parsed = _clean_json_response(raw_response)
    except Exception as err:
        logger.error("Failed to evaluate finding via AI Judge: %s", err)
        parsed = {
            "is_real_threat": True,
            "confidence_score": 75.0,
            "mitigation_diff": f"--- a/{request.file_path}\n+++ b/{request.file_path}\n@@ -{request.line_number},1 +{request.line_number},1 @@\n-# Código sospechoso reportado\n+# Aplicar validación estricta",
            "explanation": f"Evaluación de contingencia: Falló la llamada al LLM ({err}). Se mantiene la severidad SAST como precaución.",
        }

    return FindingEvaluationResponse(
        finding_id=request.finding_id,
        is_real_threat=bool(parsed.get("is_real_threat", True)),
        confidence_score=float(parsed.get("confidence_score", 85.0)),
        mitigation_diff=str(parsed.get("mitigation_diff", "")),
        explanation=str(parsed.get("explanation", "")),
        model_used=active_model_label,
    )
