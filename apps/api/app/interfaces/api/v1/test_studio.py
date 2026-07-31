import logging
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.db_inspector.orm_detector import detect_framework
from app.infrastructure.llm.litellm_gateway import LiteLLMGateway
from app.infrastructure.repositories import prompt_repository
from app.infrastructure.repositories.tool_model_repository import (
    resolve_tool_model,
    tool_model_label,
)
from app.infrastructure.test_inspector.test_scanner import scan_project_tests

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/projects/{project_id}/tests",
    tags=["Test Studio"]
)

class TestGenerationRequest(BaseModel):
    file_path: str

class TestAuditRequest(BaseModel):
    file_path: str
    test_file_path: str | None = None

@router.get("/discovery")
async def discover_tests(project_id: str, session: AsyncSession = Depends(get_db_session)) -> dict[str, Any]:
    """
    Scans the project to discover test files, frameworks, and coverage status using multi-language heuristics.
    """
    repo = SQLAlchemyProjectRepository(session)
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id format")

    project = await repo.get_by_id(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tests_found = scan_project_tests(project.path)
    framework = detect_framework(project.path) or "unknown"

    return {
        "status": "success",
        "framework": framework,
        "items": tests_found
    }

@router.post("/generate")
async def generate_tests(
    project_id: str,
    request: TestGenerationRequest,
    session: AsyncSession = Depends(get_db_session)
) -> dict[str, Any]:
    """
    Generates a test suite for a given source file using high-capacity LLM.
    """
    repo = SQLAlchemyProjectRepository(session)
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id format")

    project = await repo.get_by_id(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        project_root = Path(project.path).resolve()
        full_path = (project_root / request.file_path).resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path resolution")

    if not full_path.is_relative_to(project_root):
        raise HTTPException(status_code=403, detail="Invalid file path (Path Traversal attempt)")

    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Source file not found")

    try:
        with open(full_path, encoding="utf-8") as f:
            source_code = f.read()
    except Exception as e:
        logger.error(f"Error reading file {request.file_path}: {e}")
        raise HTTPException(status_code=500, detail="Could not read source file")

    framework = detect_framework(project.path) or "Generic"

    # Fetch prompt
    prompt_record = await prompt_repository.get_prompt_async(session, prompt_repository.TEST_GENERATOR_PROMPT_ID)
    prompt_content = prompt_record.content if prompt_record else prompt_repository.TEST_GENERATOR_CONTENT

    # Interpolate prompt
    system_prompt = prompt_content.replace("{framework}", framework) \
                                  .replace("{file_path}", request.file_path) \
                                  .replace("{source_code}", source_code)

    # Use configured model for test_studio
    provider, model_id, fallbacks = await resolve_tool_model(session, "test_studio")
    resolved_label = tool_model_label(provider, model_id)
    gateway = LiteLLMGateway(model_name=resolved_label)

    try:
        # Generar pruebas usando la IA
        response_text = await gateway.generate_completion(
            prompt=system_prompt,
            lang_code="en",
            fallbacks=fallbacks
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating tests: {str(e)}")
        raise HTTPException(status_code=500, detail="Error communicating with LLM")

    return {
        "status": "success",
        "generated_test": response_text
    }

@router.post("/audit")
async def audit_tests(
    project_id: str,
    request: TestAuditRequest,
    session: AsyncSession = Depends(get_db_session)
) -> dict[str, Any]:
    """
    Audits source code and current tests (if any) using QA Mentor.
    """
    repo = SQLAlchemyProjectRepository(session)
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id format")

    project = await repo.get_by_id(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        project_root = Path(project.path).resolve()
        full_path = (project_root / request.file_path).resolve()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path resolution")

    if not full_path.is_relative_to(project_root):
        raise HTTPException(status_code=403, detail="Invalid file path (Path Traversal attempt)")

    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Source file not found")

    try:
        with open(full_path, encoding="utf-8") as f:
            source_code = f.read()
    except Exception as e:
        logger.error(f"Error reading file {request.file_path}: {e}")
        raise HTTPException(status_code=500, detail="Could not read source file")

    current_tests = "No existing tests found."
    if request.test_file_path:
        try:
            test_full_path = (project_root / request.test_file_path).resolve()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid path resolution")

        if not test_full_path.is_relative_to(project_root):
            raise HTTPException(status_code=403, detail="Invalid test file path (Path Traversal attempt)")

        if test_full_path.exists() and test_full_path.is_file():
            try:
                with open(test_full_path, encoding="utf-8") as f:
                    current_tests = f.read()
            except Exception:
                current_tests = "Failed to read existing test file."

    prompt_record = await prompt_repository.get_prompt_async(session, prompt_repository.TEST_AUDIT_MENTOR_PROMPT_ID)
    prompt_content = prompt_record.content if prompt_record else prompt_repository.TEST_AUDIT_MENTOR_CONTENT

    system_prompt = prompt_content.replace("{file_path}", request.file_path) \
                                  .replace("{source_code}", source_code) \
                                  .replace("{current_tests}", current_tests)

    provider, model_id, fallbacks = await resolve_tool_model(session, "test_studio")
    resolved_label = tool_model_label(provider, model_id)
    gateway = LiteLLMGateway(model_name=resolved_label)

    try:
        response_text = await gateway.generate_completion(
            prompt=system_prompt,
            lang_code="en",
            fallbacks=fallbacks
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating audit: {str(e)}")
        raise HTTPException(status_code=500, detail="Error communicating with LLM for audit")

    return {
        "status": "success",
        "audit_report": response_text
    }
