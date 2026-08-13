import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db_session, get_sessionmaker
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.utils.async_io import (
    async_exists,
    async_read_text,
    async_write_text,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Projects - Memory"])
IGNORE_DIRS = {
    "node_modules",
    ".git",
    ".next",
    "dist",
    "__pycache__",
    ".venv",
    "target",
    "build",
    ".turbo",
    "coverage",
}
SOURCE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".php"}
MAX_FILE_BYTES = 500_000


def _count_tech_stack(project_root: Path) -> tuple[dict[str, int], int]:
    """Count file extensions and total files. Blocking — run inside a thread."""
    tech_stack: dict[str, int] = {}
    total_files = 0

    for dirpath, dirnames, filenames in os.walk(project_root):
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS and not d.startswith(".")]
        for filename in filenames:
            ext = Path(filename).suffix.lower()
            if ext:
                tech_stack[ext] = tech_stack.get(ext, 0) + 1
            total_files += 1
    return tech_stack, total_files


def _load_json_file(path: str) -> dict[str, Any]:
    """Load a JSON file into a dict. Blocking — run inside a thread."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _dump_json_file(path: str, data: dict[str, Any]) -> None:
    """Write a dict to a JSON file. Blocking — run inside a thread."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _collect_search_index_entries(
    root: Path,
) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    """Walk the project tree and extract symbols. Blocking — run inside a thread."""
    from app.infrastructure.scanners.symbol_extractor import extract_symbols

    inserts: list[dict[str, str]] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS and not d.startswith(".")]
        for filename in filenames:
            file_path = str(Path(dirpath) / filename)
            inserts.append({"type": "file", "name": filename, "path": file_path})

    symbol_inserts: list[dict[str, Any]] = []
    for entry in inserts:
        fp = Path(entry["path"])
        if not fp.exists() or fp.stat().st_size > MAX_FILE_BYTES:
            continue
        ext = fp.suffix.lower()
        if ext not in SOURCE_EXTENSIONS:
            continue
        try:
            content = fp.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            logger.warning("Unhandled exception", exc_info=True)
            continue
        symbols = extract_symbols(str(fp), content)
        for sym in symbols:
            symbol_inserts.append(
                {"type": "symbol", "name": sym["name"], "path": str(fp), "line": sym["line"]}
            )
    return inserts, symbol_inserts


async def build_search_index(project_root: str, session: AsyncSession | None = None) -> int:
    """Rebuild the FTS5 search index for a project directory.

    Can receive an existing session (from /analyze) or create its own
    (for background tasks). Returns total files indexed.
    """
    own_session = session is None
    if own_session:
        session = get_sessionmaker()()

    assert session is not None

    try:
        root = Path(project_root).resolve()
        await session.execute(text("DELETE FROM search_index"))

        inserts, symbol_inserts = await asyncio.to_thread(_collect_search_index_entries, root)

        if inserts:
            await session.execute(
                text("INSERT INTO search_index (type, name, path) VALUES (:type, :name, :path)"),
                inserts,
            )

        if symbol_inserts:
            await session.execute(
                text(
                    "INSERT INTO search_index (type, name, path, line) VALUES (:type, :name, :path, :line)"
                ),
                symbol_inserts,
            )

        await session.commit()
        return len(inserts)
    finally:
        if own_session and session:
            await session.close()


@router.post("/projects/{project_id}/analyze")
async def analyze_project(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_root = Path(project.path).resolve()
    if not await async_exists(project_root):
        raise HTTPException(status_code=404, detail="Project path not found on disk")

    # ── Rebuild FTS5 search index ──────────────────────────────────────
    await build_search_index(str(project_root), session)

    # ── Tech stack counting ────────────────────────────────────────────
    tech_stack, total_files = await asyncio.to_thread(_count_tech_stack, project_root)

    # ── Run language scanners ──────────────────────────────────────────
    from app.infrastructure.scanners.python_scanner import PythonScanner

    global_markers: dict = {}

    try:
        py_scanner = PythonScanner()
        py_markers = await asyncio.to_thread(py_scanner.scan, str(project_root))
        global_markers.update(py_markers)
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)
        pass  # scanner failures are non-fatal

    return {
        "tech_stack": dict(sorted(tech_stack.items(), key=lambda x: x[1], reverse=True)),
        "total_files": total_files,
        "global_markers": global_markers,
    }


@router.get("/search")
async def search_everywhere(
    q: str = Query(..., min_length=1, description="Search query"),
    session: AsyncSession = Depends(get_db_session),
):
    sanitized = f"%{q.strip()}%"
    if not sanitized or sanitized in ("%%", "%*%"):
        return {"results": []}

    try:
        result = await session.execute(
            text(
                "SELECT type, name, path, line FROM search_index "
                "WHERE name LIKE :q OR path LIKE :q OR content LIKE :q LIMIT 50"
            ),
            {"q": sanitized},
        )
        rows = result.fetchall()

        return {
            "results": [
                {
                    "type": row[0],
                    "name": row[1],
                    "path": row[2],
                    "line": row[3],
                }
                for row in rows
            ]
        }
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)
        return {"results": []}


class MemorySaveRequest(BaseModel):
    agent_name: str
    context_type: str  # architectural_decision, bug_fix, chat_summary
    memory_content: str


@router.post("/projects/{project_id}/memory")
async def save_project_memory(
    project_id: str, request: MemorySaveRequest, session: AsyncSession = Depends(get_db_session)
):
    await session.execute(
        text(
            "INSERT INTO project_memories (project_id, agent_name, context_type, memory_content) "
            "VALUES (:pid, :agent, :ctype, :content)"
        ),
        {
            "pid": project_id,
            "agent": request.agent_name.replace("'", "''"),
            "ctype": request.context_type,
            "content": request.memory_content.replace("'", "''"),
        },
    )
    await session.commit()
    return {"status": "saved"}


@router.get("/projects/{project_id}/memory/search")
async def search_project_memory(
    project_id: str,
    q: str = Query(..., min_length=1),
    session: AsyncSession = Depends(get_db_session),
):
    sanitized = q.replace("'", "''").strip()
    if not sanitized:
        return {"results": []}

    query_str = sanitized + "*"

    try:
        result = await session.execute(
            text(
                "SELECT agent_name, context_type, memory_content FROM project_memories "
                "WHERE project_memories MATCH :q AND project_id = :pid "
                "ORDER BY rank LIMIT 20"
            ),
            {"q": query_str, "pid": project_id},
        )
        rows = result.fetchall()
        return {
            "results": [
                {"agent_name": r[0], "context_type": r[1], "memory_content": r[2]} for r in rows
            ]
        }
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)
        return {"results": []}


class ProposalAction(BaseModel):
    action: str  # "apply" | "reject"


@router.post("/projects/{project_id}/proposals/{proposal_id}/apply")
async def apply_proposal(project_id: str, proposal_id: str):
    import hashlib

    from app.application.ai_agent import _proposals_store

    proposal = _proposals_store.get(proposal_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    try:
        target = Path(proposal["absolute_path"])
        current_content = await async_read_text(target, errors="ignore")
        current_hash = hashlib.sha256(current_content.encode()).hexdigest()
        expected_hash = proposal.get("original_file_hash", "")

        if expected_hash and current_hash != expected_hash:
            raise HTTPException(
                status_code=409,
                detail=(
                    "El archivo fue modificado desde que se generó esta propuesta. "
                    "Rechazala y pedile a la IA que genere una nueva propuesta "
                    "basada en la versión actual del archivo."
                ),
            )

        await async_write_text(target, proposal["new_file_content"])
        del _proposals_store[proposal_id]
        return {
            "status": "applied",
            "proposal_id": proposal_id,
            "file": proposal["file_path"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to apply proposal: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")


@router.post("/projects/{project_id}/proposals/{proposal_id}/reject")
async def reject_proposal(project_id: str, proposal_id: str):
    from app.application.ai_agent import _proposals_store

    proposal = _proposals_store.pop(proposal_id, None)
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    return {
        "status": "rejected",
        "proposal_id": proposal_id,
        "file": proposal["file_path"],
    }
