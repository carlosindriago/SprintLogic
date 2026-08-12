import asyncio
import json
import logging
import os
import re
from pathlib import Path
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
)
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.utils.async_io import (
    async_copy2,
    async_exists,
    async_is_file,
    async_mkdir_parents,
    async_read_bytes,
    async_remove,
    async_rename,
    async_write_text,
)
from app.utils.security import resolve_project_path

from .memory import build_search_index

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Projects - Files"])
from sqlalchemy import select

from app.infrastructure.db.models import GraphNodeModel

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

class FileContentUpdate(BaseModel):
    content: str
    base_hash: str | None = None

class RenameRequest(BaseModel):
    path: str
    new_name: str

class FileOperationRequest(BaseModel):
    path: str

@router.get("/projects/{project_id}/files")
async def get_project_files(
    project_id: str,
    background_tasks: BackgroundTasks,
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

    def build_tree(path):
        name = os.path.basename(path)
        is_dir = os.path.isdir(path)
        node = {"name": name, "path": path, "type": "directory" if is_dir else "file"}

        if is_dir:
            try:
                children = []
                for entry in os.scandir(path):
                    if entry.name in (".git", "node_modules", ".venv", "__pycache__"):
                        continue
                    children.append(build_tree(entry.path))
                node["children"] = sorted(
                    children, key=lambda x: (x["type"] != "directory", x["name"])
                )
            except PermissionError:
                node["children"] = []
        return node

    if not await asyncio.to_thread(os.path.exists, project.path):
        raise HTTPException(status_code=404, detail="Project path not found on disk")

    tree = await asyncio.to_thread(build_tree, project.path)
    background_tasks.add_task(build_search_index, project.path)
    return tree

@router.get("/projects/{project_id}/files/ast-folds")
async def get_ast_folds(
    project_id: str,
    file_path: str,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")



    from app.domain.graph_models import NodeLabel

    stmt = select(GraphNodeModel).where(
        GraphNodeModel.project_id == project_uuid,
        GraphNodeModel.file_path == file_path,
        GraphNodeModel.label.in_([NodeLabel.FUNCTION, NodeLabel.CLASS])
    )
    result = await session.execute(stmt)
    nodes = result.scalars().all()

    folds = []
    for node in nodes:
        if node.meta_data:
            try:
                meta = json.loads(node.meta_data)
                start = meta.get("start_line")
                end = meta.get("end_line")
                if start and end:
                    folds.append({
                        "start_line": start,
                        "end_line": end,
                        "type": str(node.label)
                    })
            except json.JSONDecodeError:
                pass

    return {"folds": folds}

@router.get("/projects/{project_id}/file/content")
async def get_project_file_content(
    project_id: str, path: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    candidate = resolve_project_path(project.path, path)

    if not await asyncio.to_thread(candidate.is_file):
        raise HTTPException(status_code=404, detail="File not found")

    import hashlib

    try:
        raw_content = await async_read_bytes(candidate)
        content = raw_content.decode("utf-8")
        file_hash = hashlib.sha256(raw_content).hexdigest()
        return {"content": content, "original_hash": file_hash}
    except Exception as e:
        logger.error("Failed to read file failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")

@router.put("/projects/{project_id}/file/content")
async def update_project_file_content(
    project_id: str,
    path: str,
    payload: FileContentUpdate,
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

    candidate = resolve_project_path(project.path, path)

    if not await asyncio.to_thread(candidate.is_file):
        raise HTTPException(status_code=404, detail="File not found")

    import hashlib

    try:
        # Optimistic Concurrency Control (ETag logic)
        if payload.base_hash:
            current_raw = await async_read_bytes(candidate)
            current_hash = hashlib.sha256(current_raw).hexdigest()
            if current_hash != payload.base_hash:
                raise HTTPException(
                    status_code=409, detail="File has been modified externally since last read"
                )

        await async_write_text(candidate, payload.content)

        new_raw = await async_read_bytes(candidate)
        new_hash = hashlib.sha256(new_raw).hexdigest()

        return {"status": "success", "new_hash": new_hash}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to write file failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")

@router.post("/projects/{project_id}/file/create")
async def create_project_file(
    project_id: str,
    path: str,
    payload: FileContentUpdate,
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

    candidate = resolve_project_path(project.path, path)

    if await async_exists(candidate):
        raise HTTPException(status_code=409, detail="File already exists")

    try:
        await async_mkdir_parents(candidate)
        await async_write_text(candidate, payload.content)
        return {"status": "created", "path": str(candidate.relative_to(Path(project.path).resolve()))}
    except Exception as e:
        logger.error("Failed to create file failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")

@router.post("/projects/{project_id}/file/rename")
async def rename_project_file(
    project_id: str,
    request: RenameRequest,
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

    candidate = resolve_project_path(project.path, request.path)

    if not await async_exists(candidate):
        raise HTTPException(status_code=404, detail="File not found")

    if not re.match(r"^[^/\0]+$", request.new_name):
        raise HTTPException(status_code=400, detail="Invalid file name")

    new_path = candidate.parent / request.new_name
    if not new_path.is_relative_to(Path(project.path).resolve()):
        raise HTTPException(
            status_code=403, detail="Renamed path would be outside project directory"
        )

    if await async_exists(new_path):
        raise HTTPException(status_code=409, detail="A file with that name already exists")

    try:
        await async_rename(candidate, new_path)
        relative = str(new_path.relative_to(Path(project.path).resolve()))
        return {"status": "renamed", "path": relative}
    except Exception as e:
        logger.error("Failed to rename file failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")

@router.post("/projects/{project_id}/file/duplicate")
async def duplicate_project_file(
    project_id: str,
    request: FileOperationRequest,
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

    candidate = resolve_project_path(project.path, request.path)

    if not await async_is_file(candidate):
        raise HTTPException(status_code=404, detail="File not found")

    stem = candidate.stem
    suffix = candidate.suffix
    duplicate_path = candidate.parent / f"{stem}_copy{suffix}"

    counter = 1
    while await async_exists(duplicate_path):
        duplicate_path = candidate.parent / f"{stem}_copy{counter}{suffix}"
        counter += 1

    try:
        await async_copy2(candidate, duplicate_path)
        relative = str(duplicate_path.relative_to(Path(project.path).resolve()))
        return {"status": "duplicated", "path": relative}
    except Exception as e:
        logger.error("Failed to duplicate file failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")

@router.delete("/projects/{project_id}/file/delete")
async def delete_project_file(
    project_id: str,
    path: str = Query(...),
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

    candidate = resolve_project_path(project.path, path)

    if not await async_is_file(candidate):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        await async_remove(candidate)
        return {"status": "deleted", "path": path}
    except Exception as e:
        logger.error("Failed to delete file failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")
