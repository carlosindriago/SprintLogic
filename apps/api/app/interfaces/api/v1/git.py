from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Literal, Dict, Any
from uuid import UUID
import hashlib
import time
import json

from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.git.git_gateway import LocalGitGateway
from app.infrastructure.ai.llm_gateway import LiteLLMGateway

router = APIRouter()
git_gateway = LocalGitGateway()
llm_gateway = LiteLLMGateway()


class GitActionRequest(BaseModel):
    action: str
    message: str = ""

class CreateBranchRequest(BaseModel):
    name: str
    start_point: Optional[str] = None

class CheckoutRequest(BaseModel):
    target: str

class ResetRequest(BaseModel):
    mode: Literal['soft', 'mixed', 'hard']

class MergeRequest(BaseModel):
    source_branch: str

class AddRemoteRequest(BaseModel):
    name: str = "origin"
    url: str

# Simple in-memory idempotency store
# Map of idempotency_key -> { 'body_hash': str, 'response': dict, 'timestamp': float }
IDEMPOTENCY_STORE: Dict[str, Dict[str, Any]] = {}
IDEMPOTENCY_TTL = 86400  # 24 hours

def get_idempotent_response(key: Optional[str], body_dict: dict):
    if not key:
        return None
    now = time.time()
    # Cleanup expired keys periodically
    expired = [k for k, v in IDEMPOTENCY_STORE.items() if now - v['timestamp'] > IDEMPOTENCY_TTL]
    for k in expired:
        del IDEMPOTENCY_STORE[k]
        
    if key in IDEMPOTENCY_STORE:
        record = IDEMPOTENCY_STORE[key]
        body_hash = hashlib.sha256(json.dumps(body_dict, sort_keys=True).encode()).hexdigest()
        if record['body_hash'] != body_hash:
            raise HTTPException(status_code=409, detail="Conflict: Idempotency-Key used with different payload")
        return record['response']
    return None

def store_idempotent_response(key: Optional[str], body_dict: dict, response: dict):
    if not key:
        return
    body_hash = hashlib.sha256(json.dumps(body_dict, sort_keys=True).encode()).hexdigest()
    IDEMPOTENCY_STORE[key] = {
        'body_hash': body_hash,
        'response': response,
        'timestamp': time.time()
    }


@router.get("/{project_id}/git/status")
async def get_git_status(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    status = await git_gateway.get_status(project.path)
    if "error" in status:
        raise HTTPException(status_code=500, detail=status["error"])

    return status


@router.get("/{project_id}/git/log")
async def get_git_log(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    commits = await git_gateway.get_recent_commits(project.path, limit=50)
    return {"commits": commits}


@router.post("/{project_id}/git/action")
async def execute_git_action(
    project_id: str,
    request: GitActionRequest,
    session: AsyncSession = Depends(get_db_session),
):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await git_gateway.execute_action(project.path, request.action, request.message)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message"))

    return result


class GenerateCommitMessageRequest(BaseModel):
    model: Optional[str] = "gemini/gemini-2.5-flash"

@router.post("/{project_id}/git/generate-commit-message")
async def generate_commit_message(project_id: str, request: GenerateCommitMessageRequest, session: AsyncSession = Depends(get_db_session)):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        diff = await git_gateway.get_diff(project.path)
        if not diff.strip():
            return {"status": "success", "message": "No hay cambios para hacer commit."}

        prompt = (
            "Eres un experto en Conventional Commits. Genera un mensaje de commit descriptivo "
            "basado en el siguiente diff de git. Devuelve SOLAMENTE el texto del mensaje de commit, "
            "sin explicaciones adicionales, sin bloques de código markdown, y sin comillas.\n\n"
            "Ejemplo de formato:\nfeat(ui): add new button\n\n"
            f"Diff:\n{diff}"
        )

        message = llm_gateway.generate_completion(prompt=prompt, model=request.model)
        
        # Clean up any potential markdown formatting the LLM might have returned
        message = message.strip()
        if message.startswith("```"):
            lines = message.split("\n")
            if len(lines) > 2:
                message = "\n".join(lines[1:-1]).strip()

        return {"status": "success", "message": message}
    except ValueError as e:
        # LLM Key missing or similar
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}/git/commits/{hash}")
async def get_commit_details(project_id: str, hash: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    details = await git_gateway.get_commit_details(project.path, hash)
    if "error" in details:
        raise HTTPException(status_code=500, detail=details["error"])

    return details


@router.get("/{project_id}/git/commits/{hash}/diff")
async def get_commit_diff(project_id: str, hash: str, path: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    modified = await git_gateway.get_file_at_commit(project.path, hash, path)
    original = await git_gateway.get_file_at_commit(project.path, f"{hash}^", path)

    return {
        "original": original,
        "modified": modified
    }


# -----------------------------------------------------------------------------
# Advanced Git Client Endpoints
# -----------------------------------------------------------------------------

@router.get("/{project_id}/git/branches")
async def get_branches(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    branches = await git_gateway.get_branches(project.path)
    return {"branches": branches}


@router.get("/{project_id}/git/sync-status")
async def get_sync_status(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    status = await git_gateway.get_sync_status(project.path)
    return status


@router.get("/{project_id}/git/remote-url")
async def get_remote_url(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    url = await git_gateway.get_remote_url(project.path, "origin")
    return {"url": url}


@router.post("/{project_id}/git/remotes")
async def add_remote(
    project_id: str,
    request: AddRemoteRequest,
    session: AsyncSession = Depends(get_db_session)
):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        await git_gateway.add_remote(project.path, request.name, request.url)
        is_valid = await git_gateway.verify_remote(project.path, request.name)
        if not is_valid:
            return {"status": "success", "message": "Remoto vinculado, pero no se pudo verificar la conexión (¿requiere permisos?)."}
        return {"status": "success", "message": "Remoto vinculado correctamente."}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_id}/git/branches")
async def create_branch(
    project_id: str,
    request: CreateBranchRequest,
    session: AsyncSession = Depends(get_db_session)
):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    is_valid = await git_gateway.validate_ref_name(request.name)
    if not is_valid:
        raise HTTPException(status_code=422, detail="Invalid branch name format")

    try:
        out = await git_gateway.create_branch(project.path, request.name, request.start_point)
        return {"status": "success", "output": out}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{project_id}/git/branches/{branch_name:path}")
async def delete_branch(
    project_id: str,
    branch_name: str,
    force: bool = False,
    session: AsyncSession = Depends(get_db_session)
):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    from app.infrastructure.git.git_gateway import UnmergedBranchError
    try:
        out = await git_gateway.delete_branch(project.path, branch_name, force)
        return {"status": "success", "output": out}
    except UnmergedBranchError as e:
        raise HTTPException(status_code=409, detail={"message": str(e), "requires_force": e.requires_force})
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{project_id}/git/head")
async def checkout_head(
    project_id: str,
    request: CheckoutRequest,
    session: AsyncSession = Depends(get_db_session)
):
    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        out = await git_gateway.checkout(project.path, request.target)
        return {"status": "success", "output": out}
    except RuntimeError as e:
        if "Dirty working tree" in str(e):
            raise HTTPException(status_code=409, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_id}/git/commits/{hash}/reset")
async def reset_commit(
    project_id: str,
    hash: str,
    request: ResetRequest,
    session: AsyncSession = Depends(get_db_session),
    idempotency_key: Optional[str] = Header(None)
):
    cached = get_idempotent_response(idempotency_key, request.model_dump())
    if cached: return cached

    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        out = await git_gateway.reset(project.path, hash, request.mode)
        resp = {"status": "success", "output": out}
        store_idempotent_response(idempotency_key, request.model_dump(), resp)
        return resp
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_id}/git/commits/{hash}/revert")
async def revert_commit(
    project_id: str,
    hash: str,
    session: AsyncSession = Depends(get_db_session),
    idempotency_key: Optional[str] = Header(None)
):
    cached = get_idempotent_response(idempotency_key, {})
    if cached: return cached

    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        out = await git_gateway.revert(project.path, hash)
        resp = {"status": "success", "output": out}
        store_idempotent_response(idempotency_key, {}, resp)
        return resp
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_id}/git/commits/{hash}/cherry-pick")
async def cherry_pick_commit(
    project_id: str,
    hash: str,
    session: AsyncSession = Depends(get_db_session),
    idempotency_key: Optional[str] = Header(None)
):
    cached = get_idempotent_response(idempotency_key, {})
    if cached: return cached

    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        out = await git_gateway.cherry_pick(project.path, hash)
        resp = {"status": "success", "output": out}
        store_idempotent_response(idempotency_key, {}, resp)
        return resp
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{project_id}/git/merge")
async def merge_branch(
    project_id: str,
    request: MergeRequest,
    session: AsyncSession = Depends(get_db_session),
    idempotency_key: Optional[str] = Header(None)
):
    cached = get_idempotent_response(idempotency_key, request.model_dump())
    if cached: return cached

    try:
        project = await SQLAlchemyProjectRepository(session).get_project(UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        out = await git_gateway.merge(project.path, request.source_branch)
        resp = {"status": "success", "output": out}
        store_idempotent_response(idempotency_key, request.model_dump(), resp)
        return resp
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
