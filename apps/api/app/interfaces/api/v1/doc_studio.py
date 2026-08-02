import logging
import uuid
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.models import UniversalBookmarkModel
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.doc_inspector.doc_scanner import scan_markdown_docs, scan_undocumented_code
from app.infrastructure.llm.litellm_gateway import LiteLLMGateway
from app.infrastructure.repositories import prompt_repository

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/projects/{project_id}/docs",
    tags=["Document Studio"]
)

class DocChatRequest(BaseModel):
    query: str

class AutoDocRequest(BaseModel):
    file_path: str

class AuditDocRequest(BaseModel):
    file_path: str

class SaveDocRequest(BaseModel):
    file_path: str
    content: str

class CreateBookmarkRequest(BaseModel):
    file_path: str
    selected_text: str
    note: str | None = None
    start_line: int | None = None
    end_line: int | None = None

@router.get("/tree")
async def discover_docs(
    project_id: str,
    session: AsyncSession = Depends(get_db_session)
) -> dict[str, Any]:
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_by_id(pid)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    markdown_files = scan_markdown_docs(project.path)
    undocumented_code = scan_undocumented_code(project.path)

    return {
        "markdown_files": markdown_files,
        "undocumented_code": undocumented_code
    }

@router.post("/chat")
async def chat_with_docs(
    project_id: str,
    request: DocChatRequest,
    session: AsyncSession = Depends(get_db_session)
) -> dict[str, Any]:
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_by_id(pid)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Light RAG: Concat all markdown files
    markdown_files = scan_markdown_docs(project.path)

    rag_context = ""
    MAX_RAG_CHARS = 100000
    is_truncated = False

    for item in markdown_files:
        if len(rag_context) >= MAX_RAG_CHARS:
            is_truncated = True
            break

        file_path = item["file_path"]
        full_path = Path(project.path) / file_path

        try:
            with open(full_path, encoding="utf-8") as f:
                content = f.read()

            chunk = f"\\n\\n--- FILE: {file_path} ---\\n{content}"
            if len(rag_context) + len(chunk) > MAX_RAG_CHARS:
                remaining = MAX_RAG_CHARS - len(rag_context)
                rag_context += chunk[:remaining]
                is_truncated = True
                break
            else:
                rag_context += chunk
        except Exception as e:
            logger.warning(f"Could not read {full_path} for RAG: {e}")

    if is_truncated:
        rag_context += "\\n\\n[...Documentación truncada por límites de contexto...]"

    llm = LiteLLMGateway()

    prompt = prompt_repository.DOC_RAG_PROMPT_CONTENT.format(
        user_query=request.query,
        rag_context=rag_context
    )


    try:
        response = await llm.generate_completion(
            prompt=prompt,
            lang_code="en"
        )
    except Exception as e:
        logger.error(f"Error in Light RAG LLM: {e}")
        raise HTTPException(status_code=500, detail="Error generating answer from LLM")

    return {
        "reply": response,
        "context_truncated": is_truncated
    }

@router.post("/generate-docblock")
async def generate_docblock(
    project_id: str,
    request: AutoDocRequest,
    session: AsyncSession = Depends(get_db_session)
) -> dict[str, Any]:
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_by_id(pid)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    full_path = Path(project.path) / request.file_path

    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Source file not found")

    try:
        with open(full_path, encoding="utf-8") as f:
            source_code = f.read()
    except Exception as e:
        logger.error(f"Error reading file {request.file_path}: {e}")
        raise HTTPException(status_code=500, detail="Could not read source file")

    llm = LiteLLMGateway()

    prompt = prompt_repository.AUTO_DOC_PROMPT_CONTENT.format(
        file_path=request.file_path,
        source_code=source_code
    )


    try:
        response = await llm.generate_completion(
            prompt=prompt,
            lang_code="en"
        )
    except Exception as e:
        logger.error(f"Error generating Auto-Doc: {e}")
        raise HTTPException(status_code=500, detail="Error generating Auto-Doc from LLM")

    return {
        "documented_code": response
    }

@router.post("/audit")
async def audit_doc(
    project_id: str,
    request: AuditDocRequest,
    session: AsyncSession = Depends(get_db_session)
) -> dict[str, Any]:
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_by_id(pid)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_root = Path(project.path)
    full_path = project_root / request.file_path

    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Source file not found")

    try:
        with open(full_path, encoding="utf-8") as file_obj:
            doc_content = file_obj.read()
    except Exception as e:
        logger.error(f"Error reading file {request.file_path}: {e}")
        raise HTTPException(status_code=500, detail="Could not read source file")

    import os

    from app.infrastructure.doc_inspector.doc_scanner import GLOBAL_IGNORED_DIRS

    # Generate Tree
    tree_lines = []
    for root, dirs, files in os.walk(project_root):
        dirs[:] = [d for d in dirs if d not in GLOBAL_IGNORED_DIRS]
        level = str(root).replace(str(project_root), "").count(os.sep)
        indent = " " * 4 * (level)
        tree_lines.append(f"{indent}{os.path.basename(root)}/")
        subindent = " " * 4 * (level + 1)
        for file_name in files:
            tree_lines.append(f"{subindent}{file_name}")

    # Generate tree string (truncate if extremely large)
    project_tree = "\\n".join(tree_lines)[:10000]

    # Gather manifests
    manifest_files = ["package.json", "composer.json", "requirements.txt", "pom.xml", "go.mod"]
    manifests_content = ""
    for m in manifest_files:
        m_path = project_root / m
        if m_path.exists() and m_path.is_file():
            try:
                with open(m_path, encoding="utf-8") as manifest_file:
                    manifests_content += f"\\n--- {m} ---\\n{manifest_file.read()}\\n"
            except Exception:
                pass
    if not manifests_content:
        manifests_content = "No manifests found."

    # RAG Context (same logic as chat)
    markdown_files = scan_markdown_docs(project.path)
    rag_context = ""
    MAX_RAG_CHARS = 100000
    for item in markdown_files:
        if item["file_path"] == request.file_path:
            continue
        if len(rag_context) >= MAX_RAG_CHARS:
            break
        fp = project_root / item["file_path"]
        try:
            with open(fp, encoding="utf-8") as f:
                chunk = f"\\n--- FILE: {item['file_path']} ---\\n{f.read()}"
                remaining = MAX_RAG_CHARS - len(rag_context)
                rag_context += chunk[:remaining]
        except Exception:
            pass

    from app.infrastructure.repositories.tool_model_repository import resolve_tool_model
    tool_provider, tool_model, fallbacks = await resolve_tool_model(session, "document_studio")

    llm = LiteLLMGateway(model_name=f"{tool_provider}/{tool_model}")

    prompt = prompt_repository.DOC_AUDIT_PROMPT_CONTENT.format(
        project_tree=project_tree,
        project_manifests=manifests_content,
        rag_context=rag_context,
        file_path=request.file_path,
        doc_content=doc_content
    )

    try:
        response = await llm.generate_completion(
            prompt=prompt,
            lang_code="es",
            fallbacks=fallbacks
        )
    except Exception as e:
        logger.error(f"Error generating Audit: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Error generating Audit from LLM")

    return {
        "report": response
    }

@router.put("/file")
async def save_doc_file(
    project_id: str,
    request: SaveDocRequest,
    session: AsyncSession = Depends(get_db_session)
) -> dict[str, Any]:
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_by_id(pid)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        project_root = Path(project.path).resolve()
        target_path = (project_root / request.file_path).resolve()

        # Security: Prevent path traversal
        if not target_path.is_relative_to(project_root):
            raise HTTPException(status_code=403, detail="Invalid file path (Path Traversal attempt)")

    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path resolution")

    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(request.content)
    except Exception as e:
        logger.error(f"Error saving file {target_path}: {e}")
        raise HTTPException(status_code=500, detail="Could not save file")

    return {"status": "ok", "file_path": request.file_path}

@router.get("/bookmarks")
async def get_bookmarks(
    project_id: str,
    session: AsyncSession = Depends(get_db_session)
) -> list[dict[str, Any]]:
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id format")

    stmt = select(UniversalBookmarkModel).where(UniversalBookmarkModel.project_id == pid, UniversalBookmarkModel.item_type == "document").order_by(UniversalBookmarkModel.created_at.desc())
    result = await session.execute(stmt)
    bookmarks = result.scalars().all()

    return [
        {
            "id": str(b.id),
            "file_path": b.file_path,
            "selected_text": b.selected_text,
            "note": b.note,
            "start_line": b.start_line,
            "end_line": b.end_line,
            "created_at": b.created_at.isoformat()
        } for b in bookmarks
    ]

@router.post("/bookmarks")
async def create_bookmark(
    project_id: str,
    request: CreateBookmarkRequest,
    session: AsyncSession = Depends(get_db_session)
) -> dict[str, Any]:
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id format")

    new_bookmark = UniversalBookmarkModel(
        id=uuid.uuid4(),
        project_id=pid,
        file_path=request.file_path,
        selected_text=request.selected_text,
        note=request.note,
        item_type="document",
        start_line=request.start_line,
        end_line=request.end_line
    )

    session.add(new_bookmark)
    await session.commit()

    return {
        "id": str(new_bookmark.id),
        "file_path": new_bookmark.file_path,
        "selected_text": new_bookmark.selected_text,
        "note": new_bookmark.note,
        "created_at": new_bookmark.created_at.isoformat()
    }
