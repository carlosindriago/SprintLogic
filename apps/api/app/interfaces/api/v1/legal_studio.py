"""Legal Studio API Router (Docs-as-Code Compliance Auditor & Legal Counsel).

Handles technical compliance audits (GDPR, CCPA, Terms, Cookies), Docs-as-Code
markdown persistence in docs/legal/, and handoff to Kanban / Planning Studio.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.domain.kanban_models import TicketPriority, TicketStatus, TicketType
from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.models import KanbanTicketModel, ProjectModel, PromptRegistryModel
from app.infrastructure.llm.litellm_gateway import LiteLLMGateway
from app.infrastructure.repositories import prompt_repository
from app.infrastructure.repositories.tool_model_repository import (
    resolve_tool_model,
    tool_model_label,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/legal", tags=["Legal Studio"])


class LegalAuditRequest(BaseModel):
    user_query: str = Field(
        default="Realiza la auditoría de cumplimiento legal y regulatorio del proyecto.",
        description="Consulta o respuesta del usuario en el chat de asesoría legal.",
    )
    conversation_history: list[dict[str, str]] = Field(
        default_factory=list,
        description="Historial previo de mensajes {role: user|assistant, content: string}.",
    )
    target_doc: str | None = Field(
        default=None,
        description="Documento específico que se solicita redactar (ej. terms_of_service, privacy_policy, cookie_policy).",
    )


class LegalAuditResponse(BaseModel):
    response: str
    model_used: str
    detected_dependencies: list[str]
    suggested_docs: list[str]


class SaveLegalDocRequest(BaseModel):
    doc_name: str = Field(
        ...,
        description="Nombre del archivo a guardar en docs/legal/ (ej. privacy_policy.md, terms_of_service.md).",
    )
    content: str = Field(
        ...,
        description="Contenido Markdown completo del documento legal.",
    )


class SaveLegalDocResponse(BaseModel):
    status: str
    file_path: str
    doc_name: str
    saved_bytes: int


class LegalDocItem(BaseModel):
    name: str
    relative_path: str
    content: str
    modified_at: float
    size_bytes: int


class LegalDocsListResponse(BaseModel):
    documents: list[LegalDocItem]


class LegalMitigationTaskItem(BaseModel):
    title: str
    description: str = ""
    priority: str = "medium"
    category: str = "compliance"


class LegalMitigationHandoffRequest(BaseModel):
    tasks: list[LegalMitigationTaskItem]


class LegalMitigationHandoffResponse(BaseModel):
    status: str
    created_count: int
    ticket_ids: list[str]


async def _get_project_and_path(session: AsyncSession, project_id: str) -> tuple[ProjectModel, Path]:
    """Retrieve ProjectModel and validate project directory path on disk."""
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project_id format",
        )

    res = await session.execute(select(ProjectModel).where(ProjectModel.id == project_uuid))
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )

    if not project.path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project does not have a valid local filesystem path configured",
        )

    project_root = Path(project.path)
    if not project_root.exists() or not project_root.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Project directory path '{project.path}' does not exist on disk",
        )

    return project, project_root


def _extract_dependencies_content(project_root: Path) -> tuple[str, list[str]]:
    """Scan and read project manifest and dependency files."""
    dep_filenames = {
        "package.json",
        "pyproject.toml",
        "requirements.txt",
        "Pipfile",
        "composer.json",
        "Gemfile",
        "go.mod",
        "Cargo.toml",
    }
    ignored_dirs = {
        ".git",
        "node_modules",
        ".venv",
        "venv",
        "dist",
        "build",
        ".next",
        "__pycache__",
        ".cache",
        "vendor",
    }

    found_files: list[str] = []
    content_blocks: list[str] = []

    for root, dirs, files in os.walk(project_root):
        dirs[:] = [d for d in dirs if d not in ignored_dirs and not d.startswith(".")]
        for f in files:
            if f in dep_filenames:
                file_full_path = Path(root) / f
                try:
                    rel_path = file_full_path.relative_to(project_root)
                    rel_str = str(rel_path)
                    found_files.append(rel_str)
                    text = file_full_path.read_text(encoding="utf-8", errors="replace")
                    # Limit file size to prevent token blowup
                    if len(text) > 12000:
                        text = text[:12000] + "\n... [Resto del archivo truncado]"
                    content_blocks.append(f"### Archivo: `{rel_str}`\n```\n{text}\n```")
                except Exception as e:
                    logger.warning("Error reading dependency file %s: %s", file_full_path, e)

    combined_text = "\n\n".join(content_blocks) if content_blocks else "No se detectaron archivos de dependencias conocidos."
    return combined_text, found_files


def _extract_topological_summary(project_root: Path) -> str:
    """Extract a quick top-level directory structure summary."""
    lines: list[str] = []
    ignored = {".git", "node_modules", ".venv", "venv", "dist", "build", ".next", "__pycache__"}
    try:
        for item in sorted(project_root.iterdir()):
            if item.name in ignored or item.name.startswith("."):
                continue
            if item.is_dir():
                sub_items = [c.name for c in sorted(item.iterdir()) if not c.name.startswith(".") and c.name not in ignored]
                preview = ", ".join(sub_items[:12])
                if len(sub_items) > 12:
                    preview += f" ... (+{len(sub_items) - 12} más)"
                lines.append(f"- Directorio `{item.name}/`: [{preview}]")
            else:
                lines.append(f"- Archivo raíz: `{item.name}`")
    except Exception as e:
        logger.warning("Error generating topological summary for %s: %s", project_root, e)

    return "\n".join(lines) if lines else "Estructura de directorios no disponible."


def _sanitize_doc_filename(name: str) -> str:
    """Ensure safe markdown filename without path traversal."""
    clean_name = os.path.basename(name.strip())
    if not clean_name:
        clean_name = "legal_document.md"
    if not (clean_name.endswith(".md") or clean_name.endswith(".markdown")):
        clean_name += ".md"
    # Replace dangerous or unwanted chars
    clean_name = "".join(c for c in clean_name if c.isalnum() or c in ("-", "_", "."))
    return clean_name


@router.post("/audit", response_model=LegalAuditResponse)
async def audit_project_compliance(
    project_id: str,
    payload: LegalAuditRequest,
    session: AsyncSession = Depends(get_db_session),
) -> LegalAuditResponse:
    """Execute Legal Counsel audit reading topological map & dependencies."""
    _, project_root = await _get_project_and_path(session, project_id)

    # 1. Extract dynamic project context
    dep_content, detected_files = _extract_dependencies_content(project_root)
    topo_summary = _extract_topological_summary(project_root)

    # 2. Retrieve Prompt from Registry
    prompt_result = await session.execute(
        select(PromptRegistryModel).where(PromptRegistryModel.id == prompt_repository.LEGAL_COUNSEL_PROMPT_ID)
    )
    prompt_record = prompt_result.scalars().first()
    raw_prompt_template = (
        prompt_record.content if prompt_record and prompt_record.content else prompt_repository.LEGAL_COUNSEL_PROMPT_CONTENT
    )

    # 3. Format user query with history if present
    query_context = payload.user_query
    if payload.target_doc:
        query_context += f"\n\n[SOLICITUD DE DOCUMENTO ESPECÍFICO]: Por favor genera el borrador completo para '{payload.target_doc}' en formato Markdown Docs-as-Code."

    if payload.conversation_history:
        history_formatted = "\n".join(
            f"[{msg.get('role', 'user').upper()}]: {msg.get('content', '')}"
            for msg in payload.conversation_history[-6:]
        )
        query_context = f"Historial previo de la conversación:\n{history_formatted}\n\nNueva consulta del usuario:\n{query_context}"

    full_prompt = raw_prompt_template.format(
        topological_map=topo_summary,
        dependencies_content=dep_content,
        user_query=query_context,
    )

    # 4. Resolve configured model for legal_studio
    provider_id, model_name, fallbacks = await resolve_tool_model(session, "legal_studio")

    # 5. Invoke LLM Gateway
    gateway = LiteLLMGateway(model_name=model_name)
    try:
        ai_response = await gateway.generate_completion(full_prompt, lang_code="es", fallbacks=fallbacks)
    except Exception as e:
        logger.error("Legal Studio LLM error: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en el asistente legal IA: {e!s}",
        )

    suggested_docs = [
        "privacy_policy.md",
        "terms_of_service.md",
        "cookie_policy.md",
        "refund_policy.md",
        "dpa.md",
        "acceptable_use_policy.md",
    ]

    return LegalAuditResponse(
        response=ai_response,
        model_used=tool_model_label(provider_id, model_name),
        detected_dependencies=detected_files,
        suggested_docs=suggested_docs,
    )


@router.post("/save-docs", response_model=SaveLegalDocResponse)
async def save_legal_document(
    project_id: str,
    payload: SaveLegalDocRequest,
    session: AsyncSession = Depends(get_db_session),
) -> SaveLegalDocResponse:
    """Save or update legal document physically on disk under docs/legal/."""
    _, project_root = await _get_project_and_path(session, project_id)

    safe_filename = _sanitize_doc_filename(payload.doc_name)
    legal_dir = project_root / "docs" / "legal"
    legal_dir.mkdir(parents=True, exist_ok=True)

    target_file = legal_dir / safe_filename
    try:
        target_file.write_text(payload.content, encoding="utf-8")
        saved_bytes = len(payload.content.encode("utf-8"))
    except Exception as e:
        logger.error("Failed to write legal doc %s: %s", target_file, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"No se pudo guardar el archivo en disco: {e!s}",
        )

    rel_path = f"docs/legal/{safe_filename}"
    return SaveLegalDocResponse(
        status="success",
        file_path=rel_path,
        doc_name=safe_filename,
        saved_bytes=saved_bytes,
    )


@router.get("/docs", response_model=LegalDocsListResponse)
async def list_legal_documents(
    project_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> LegalDocsListResponse:
    """List all existing legal documents under docs/legal/ in the project directory."""
    _, project_root = await _get_project_and_path(session, project_id)

    legal_dir = project_root / "docs" / "legal"
    documents: list[LegalDocItem] = []

    if legal_dir.exists() and legal_dir.is_dir():
        for file_path in sorted(legal_dir.iterdir()):
            if file_path.is_file() and (file_path.suffix.lower() in (".md", ".markdown")):
                try:
                    content = file_path.read_text(encoding="utf-8", errors="replace")
                    stat_info = file_path.stat()
                    documents.append(
                        LegalDocItem(
                            name=file_path.name,
                            relative_path=f"docs/legal/{file_path.name}",
                            content=content,
                            modified_at=stat_info.st_mtime,
                            size_bytes=stat_info.st_size,
                        )
                    )
                except Exception as e:
                    logger.warning("Error reading doc file %s: %s", file_path, e)

    return LegalDocsListResponse(documents=documents)


@router.post("/mitigation-tasks", response_model=LegalMitigationHandoffResponse)
async def create_legal_mitigation_tasks(
    project_id: str,
    payload: LegalMitigationHandoffRequest,
    session: AsyncSession = Depends(get_db_session),
) -> LegalMitigationHandoffResponse:
    """Inject compliance mitigation tickets directly into the project's Kanban backlog."""
    project, _ = await _get_project_and_path(session, project_id)

    created_ids: list[str] = []

    for task_item in payload.tasks:
        priority_map = {
            "critical": TicketPriority.HIGH,
            "high": TicketPriority.HIGH,
            "low": TicketPriority.LOW,
        }
        ticket_priority = priority_map.get(task_item.priority.lower(), TicketPriority.MEDIUM)

        description = (
            f"{task_item.description}\n\n"
            f"---\n"
            f"**Origen:** Legal Studio (Auditoría de Cumplimiento)\n"
            f"**Categoría:** {task_item.category}\n"
            f"**Acción:** Mitigación requerida para conformidad legal (Docs-as-Code)"
        )

        ticket_id = uuid4()

        ticket_model = KanbanTicketModel(
            id=ticket_id,
            project_id=project.id,
            title=f"⚖️ {task_item.title.replace('⚖️', '').strip()}",
            description=description,
            status=TicketStatus.TODO,
            priority=ticket_priority,
            type=TicketType.FEATURE,
            branch_name=f"legal/compliance-{str(ticket_id)[:8]}",
        )

        session.add(ticket_model)
        created_ids.append(str(ticket_id))

    await session.commit()

    return LegalMitigationHandoffResponse(
        status="success",
        created_count=len(created_ids),
        ticket_ids=created_ids,
    )
