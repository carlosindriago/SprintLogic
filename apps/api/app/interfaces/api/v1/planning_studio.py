from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncGenerator
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import litellm
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc, select

from app.infrastructure.ai.model_health_tracker import ModelHealthTracker
from app.infrastructure.ai.provider_adapter import ProviderAdapter
from app.infrastructure.config import DEFAULT_LLM_MODEL
from app.infrastructure.db.database import get_sessionmaker
from app.infrastructure.db.models import (
    ProjectModel,
    WBSDocumentModel,
    WBSDocumentVersionModel,
)
from app.infrastructure.repositories.tool_model_repository import (
    resolve_tool_model,
    tool_model_label,
)
from app.infrastructure.security.credential_manager import CredentialManager
from app.interfaces.api.v1.wbs_schemas import WBSHierarchicalResponse

router = APIRouter()

DEFAULT_WBS_MARKDOWN_TEMPLATE = """# 📋 Plan de Proyecto (WBS)

> **Documento Vivo de Planificación**: Este plan se sincroniza bidireccionalmente con el Sprint Center y sirve de contexto para la IA.

---

## 🎯 Épica 1: Arquitectura & Setup Inicial

### 🏃 Sprint 1 (Fundamentos y Entorno)
- [ ] **Configuración del Entorno y Dependencias** [Priority: High] [Type: Feature] [Hours: 4h] [Branch: feat/setup-env]
  - [ ] Verificar versiones de Node, Python y paquetes base
  - [ ] Configurar linters y variables de entorno
- [ ] **Esquema de Base de Datos y Modelos Iniciales** [Priority: High] [Type: Feature] [Hours: 6h] [Branch: feat/db-models]
  - [ ] Definir modelos en SQLite / SQLAlchemy
  - [ ] Ejecutar migraciones iniciales

---

## 🚀 Épica 2: Funcionalidades Principales

### 🏃 Sprint 2 (Desarrollo Core)
- [ ] **Desarrollo de Endpoints y Lógica de Negocio** [Priority: Medium] [Type: Feature] [Hours: 8h] [Branch: feat/core-logic]
  - [ ] Implementar rutas de API
  - [ ] Conectar interfaz de usuario con servicios
"""


class PlanningMessage(BaseModel):
    role: str
    content: str


class PlanningRequest(BaseModel):
    messages: list[PlanningMessage]
    project_id: str
    model: str | None = None
    current_markdown: str | None = None


class SavePlanningDocumentRequest(BaseModel):
    markdown_content: str
    change_summary: str | None = None
    file_path: str | None = "docs/planning/current_plan.md"


class PlanningDocumentResponse(BaseModel):
    id: str
    project_id: str
    file_path: str
    markdown_content: str
    version: int
    created_at: str
    updated_at: str


class PlanningVersionResponse(BaseModel):
    id: str
    project_id: str
    version: int
    change_summary: str | None
    markdown_content: str
    created_at: str


def _get_project_plan_path(project_path: str, rel_path: str = "docs/planning/current_plan.md") -> Path:
    return Path(project_path) / rel_path


# ─────────────────────────────────────────────────────────────
# Document Endpoints (Docs-as-Code & Source of Truth)
# ─────────────────────────────────────────────────────────────


@router.get("/projects/{project_id}/document", response_model=PlanningDocumentResponse)
async def get_planning_document(project_id: str):
    """Retrieves the current WBS planning document.

    Source of Truth: Disk first. If the file exists on disk, it is read and
    synced to the database. If not on disk, DB is checked and written to disk.
    If neither exists, a default scaffold is initialized on both.
    """
    try:
        project_uuid = UUID(project_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail="Invalid project UUID") from err

    async with get_sessionmaker()() as session:
        proj_res = await session.execute(select(ProjectModel).where(ProjectModel.id == project_uuid))
        project = proj_res.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        plan_file = _get_project_plan_path(project.path)
        disk_content: str | None = None
        if plan_file.is_file():
            try:
                disk_content = plan_file.read_text(encoding="utf-8")
            except Exception as e:
                logging.warning("Could not read plan file from disk: %s", e)

        doc_res = await session.execute(
            select(WBSDocumentModel).where(WBSDocumentModel.project_id == project_uuid)
        )
        doc = doc_res.scalar_one_or_none()

        now = datetime.now(datetime.UTC)

        if disk_content is not None:
            # Disk exists: Sync to DB if DB is missing or different
            if not doc:
                doc = WBSDocumentModel(
                    id=uuid4(),
                    project_id=project_uuid,
                    file_path="docs/planning/current_plan.md",
                    markdown_content=disk_content,
                    version=1,
                    created_at=now,
                    updated_at=now,
                )
                session.add(doc)
                v1 = WBSDocumentVersionModel(
                    id=uuid4(),
                    project_id=project_uuid,
                    markdown_content=disk_content,
                    change_summary="Sincronización inicial desde disco",
                    version=1,
                    created_at=now,
                )
                session.add(v1)
                await session.commit()
            elif doc.markdown_content != disk_content:
                doc.markdown_content = disk_content
                doc.updated_at = now
                await session.commit()
        else:
            # Disk does not exist: check DB
            if doc and doc.markdown_content:
                # Write to disk
                try:
                    plan_file.parent.mkdir(parents=True, exist_ok=True)
                    plan_file.write_text(doc.markdown_content, encoding="utf-8")
                except Exception as e:
                    logging.warning("Could not write plan to disk: %s", e)
            else:
                # Initialize default template
                initial_md = DEFAULT_WBS_MARKDOWN_TEMPLATE
                try:
                    plan_file.parent.mkdir(parents=True, exist_ok=True)
                    plan_file.write_text(initial_md, encoding="utf-8")
                except Exception as e:
                    logging.warning("Could not create initial plan file: %s", e)

                doc = WBSDocumentModel(
                    id=uuid4(),
                    project_id=project_uuid,
                    file_path="docs/planning/current_plan.md",
                    markdown_content=initial_md,
                    version=1,
                    created_at=now,
                    updated_at=now,
                )
                session.add(doc)
                v1 = WBSDocumentVersionModel(
                    id=uuid4(),
                    project_id=project_uuid,
                    markdown_content=initial_md,
                    change_summary="Creación inicial del documento vivo",
                    version=1,
                    created_at=now,
                )
                session.add(v1)
                await session.commit()

        return PlanningDocumentResponse(
            id=str(doc.id),
            project_id=str(doc.project_id),
            file_path=doc.file_path,
            markdown_content=doc.markdown_content,
            version=doc.version,
            created_at=doc.created_at.isoformat(),
            updated_at=doc.updated_at.isoformat(),
        )


@router.post("/projects/{project_id}/document", response_model=PlanningDocumentResponse)
async def save_planning_document(project_id: str, payload: SavePlanningDocumentRequest):
    """Saves the planning document to physical disk and database, creating a snapshot version."""
    try:
        project_uuid = UUID(project_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail="Invalid project UUID") from err

    async with get_sessionmaker()() as session:
        proj_res = await session.execute(select(ProjectModel).where(ProjectModel.id == project_uuid))
        project = proj_res.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        rel_path = payload.file_path or "docs/planning/current_plan.md"
        plan_file = _get_project_plan_path(project.path, rel_path)

        # 1. Write to physical disk (Source of Truth)
        try:
            plan_file.parent.mkdir(parents=True, exist_ok=True)
            plan_file.write_text(payload.markdown_content, encoding="utf-8")
        except Exception as e:
            logging.error("Failed to write plan to physical disk: %s", e)
            raise HTTPException(status_code=500, detail=f"Failed to write to disk: {e}") from e

        # 2. Upsert in DB
        now = datetime.now(datetime.UTC)
        doc_res = await session.execute(
            select(WBSDocumentModel).where(WBSDocumentModel.project_id == project_uuid)
        )
        doc = doc_res.scalar_one_or_none()

        new_version_num = 1
        if doc:
            new_version_num = doc.version + 1
            doc.markdown_content = payload.markdown_content
            doc.file_path = rel_path
            doc.version = new_version_num
            doc.updated_at = now
        else:
            doc = WBSDocumentModel(
                id=uuid4(),
                project_id=project_uuid,
                file_path=rel_path,
                markdown_content=payload.markdown_content,
                version=new_version_num,
                created_at=now,
                updated_at=now,
            )
            session.add(doc)

        # 3. Create Version Snapshot for Time Travel
        version_snapshot = WBSDocumentVersionModel(
            id=uuid4(),
            project_id=project_uuid,
            markdown_content=payload.markdown_content,
            change_summary=payload.change_summary or "Plan actualizado",
            version=new_version_num,
            created_at=now,
        )
        session.add(version_snapshot)
        await session.commit()

        return PlanningDocumentResponse(
            id=str(doc.id),
            project_id=str(doc.project_id),
            file_path=doc.file_path,
            markdown_content=doc.markdown_content,
            version=doc.version,
            created_at=doc.created_at.isoformat(),
            updated_at=doc.updated_at.isoformat(),
        )


@router.get("/projects/{project_id}/history", response_model=list[PlanningVersionResponse])
async def get_planning_history(project_id: str):
    """Retrieves all snapshot versions of the WBS document ordered by date descending."""
    try:
        project_uuid = UUID(project_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail="Invalid project UUID") from err

    async with get_sessionmaker()() as session:
        query = (
            select(WBSDocumentVersionModel)
            .where(WBSDocumentVersionModel.project_id == project_uuid)
            .order_by(desc(WBSDocumentVersionModel.created_at))
        )
        res = await session.execute(query)
        versions = res.scalars().all()

        return [
            PlanningVersionResponse(
                id=str(v.id),
                project_id=str(v.project_id),
                version=v.version,
                change_summary=v.change_summary,
                markdown_content=v.markdown_content,
                created_at=v.created_at.isoformat(),
            )
            for v in versions
        ]


@router.post("/projects/{project_id}/history/{version_id}/restore", response_model=PlanningDocumentResponse)
async def restore_planning_version(project_id: str, version_id: str):
    """Restores the planning document to a specific historical snapshot."""
    try:
        project_uuid = UUID(project_id)
        v_uuid = UUID(version_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail="Invalid UUID") from err

    async with get_sessionmaker()() as session:
        proj_res = await session.execute(select(ProjectModel).where(ProjectModel.id == project_uuid))
        project = proj_res.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        v_res = await session.execute(
            select(WBSDocumentVersionModel).where(
                WBSDocumentVersionModel.id == v_uuid,
                WBSDocumentVersionModel.project_id == project_uuid,
            )
        )
        version_item = v_res.scalar_one_or_none()
        if not version_item:
            raise HTTPException(status_code=404, detail="Version snapshot not found")

        # 1. Overwrite physical file
        plan_file = _get_project_plan_path(project.path)
        try:
            plan_file.parent.mkdir(parents=True, exist_ok=True)
            plan_file.write_text(version_item.markdown_content, encoding="utf-8")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to restore file on disk: {e}") from e

        # 2. Update current doc
        now = datetime.now(datetime.UTC)
        doc_res = await session.execute(
            select(WBSDocumentModel).where(WBSDocumentModel.project_id == project_uuid)
        )
        doc = doc_res.scalar_one_or_none()
        new_version_num = (doc.version + 1) if doc else 1

        if doc:
            doc.markdown_content = version_item.markdown_content
            doc.version = new_version_num
            doc.updated_at = now
        else:
            doc = WBSDocumentModel(
                id=uuid4(),
                project_id=project_uuid,
                file_path="docs/planning/current_plan.md",
                markdown_content=version_item.markdown_content,
                version=new_version_num,
                created_at=now,
                updated_at=now,
            )
            session.add(doc)

        # 3. Create restoration snapshot
        snapshot = WBSDocumentVersionModel(
            id=uuid4(),
            project_id=project_uuid,
            markdown_content=version_item.markdown_content,
            change_summary=f"Restaurado a la versión v{version_item.version}",
            version=new_version_num,
            created_at=now,
        )
        session.add(snapshot)
        await session.commit()

        return PlanningDocumentResponse(
            id=str(doc.id),
            project_id=str(doc.project_id),
            file_path=doc.file_path,
            markdown_content=doc.markdown_content,
            version=doc.version,
            created_at=doc.created_at.isoformat(),
            updated_at=doc.updated_at.isoformat(),
        )


# ─────────────────────────────────────────────────────────────
# AI Planning Message Streaming Endpoint
# ─────────────────────────────────────────────────────────────


@router.post("/message")
async def process_planning_message(req: Request, request: PlanningRequest):
    async with get_sessionmaker()() as session:
        ps_provider, ps_model, fallbacks = await resolve_tool_model(session, "planning_studio")
        model = tool_model_label(ps_provider, ps_model)

    provider = ProviderAdapter.get_provider(model)
    api_key = CredentialManager.get_api_key(
        f"sprintlogic_{provider}"
    ) or CredentialManager.get_api_key(provider)
    if not api_key and provider != "openrouter" and "ollama" not in model.lower():
        api_key = CredentialManager.get_api_key("sprintlogic_openrouter")
        if not api_key:
            raise HTTPException(status_code=400, detail=f"API key for {provider} not configured")

    adapted = ProviderAdapter.adapt(model, api_key)

    tools = [
        {
            "type": "function",
            "function": {
                "name": "render_wbs_tree",
                "description": "Render or update the structured WBS tree.",
                "parameters": WBSHierarchicalResponse.model_json_schema(),
            },
        }
    ]

    base_system = (
        "Eres un Agile Coach y Tech Lead Senior en SprintLogic Planning Studio.\n"
        "Tu objetivo es estructurar, expandir y refinar el plan WBS del proyecto en formato Markdown ('Documento Vivo').\n\n"
        "REGLAS OBLIGATORIAS:\n"
        "1. PERSISTENCIA INCREMENTAL: Si se te proporciona el plan actual existente, NO LO BORRES. "
        "Añade o modifica fases/épicas manteniendo la coherencia de lo ya planificado.\n"
        "2. FORMATO ESTRUCTURADO:\n"
        "   - Encabezados `# <Plan>`, `## Épica <N>: <Nombre>`, `### Sprint <N> (Objetivo)`\n"
        "   - Tareas con checkboxes: `- [ ] **<Título de Tarea>** [Priority: High|Medium|Low] [Type: Feature|Refactor|Technical Debt|Security] [Hours: <N>h] [Branch: feat/...]\n"
        "   - Subtareas anidadas: `  - [ ] <Subtarea técnica>`\n"
        "3. Ofrece explicaciones claras y constructivas."
    )

    if request.current_markdown:
        base_system += f"\n\n--- DOCUMENTO DE PLANIFICACIÓN ACTUAL ---\n{request.current_markdown[:6000]}\n----------------------------------------"

    messages_to_send = [{"role": "system", "content": base_system}]
    for msg in request.messages:
        messages_to_send.append({"role": msg.role, "content": msg.content})

    candidates: list[dict[str, Any]] = [
        {
            "model": adapted["model"],
            "api_key": adapted.get("api_key"),
            "kwargs": adapted.get("kwargs", {}),
        }
    ]

    all_fallback_models = list(fallbacks) if fallbacks else []
    if DEFAULT_LLM_MODEL not in all_fallback_models and DEFAULT_LLM_MODEL != model:
        all_fallback_models.append(DEFAULT_LLM_MODEL)

    for fb_model in all_fallback_models:
        fb_provider = ProviderAdapter.get_provider(fb_model)
        fb_key = (
            CredentialManager.get_api_key(f"sprintlogic_{fb_provider}")
            or CredentialManager.get_api_key(fb_provider)
            or CredentialManager.get_api_key("sprintlogic_openrouter")
            or CredentialManager.get_api_key("openrouter")
        )
        if fb_key or "ollama" in fb_model.lower():
            try:
                fb_adapted = ProviderAdapter.adapt(fb_model, fb_key)
                candidates.append(
                    {
                        "model": fb_adapted["model"],
                        "api_key": fb_adapted.get("api_key"),
                        "kwargs": fb_adapted.get("kwargs", {}),
                    }
                )
            except Exception as adapt_err:
                logging.debug("Could not adapt fallback model %s: %s", fb_model, adapt_err)

    MAX_RETRIES_PER_CANDIDATE = 2

    async def generate() -> AsyncGenerator[str, None]:
        last_error = None
        for i, candidate in enumerate(candidates):
            cand_provider = ProviderAdapter.get_provider(candidate["model"])
            for attempt in range(1, MAX_RETRIES_PER_CANDIDATE + 1):
                has_yielded = False
                timeout = 15 if attempt == 1 else 20
                t0 = time.perf_counter()
                try:
                    if i > 0 or attempt > 1:
                        logging.info(
                            "Planning streaming: candidate %d (%s) attempt %d/%d (timeout=%ds)",
                            i,
                            candidate["model"],
                            attempt,
                            MAX_RETRIES_PER_CANDIDATE,
                            timeout,
                        )

                    response = await litellm.acompletion(
                        model=candidate["model"],
                        messages=messages_to_send,
                        tools=tools,
                        api_key=candidate["api_key"],
                        stream=True,
                        num_retries=0,
                        timeout=timeout,
                        **candidate["kwargs"],
                    )

                    tool_calls_buffer: dict[int, Any] = {}

                    async for chunk in response:
                        choice = chunk.choices[0]
                        delta = choice.delta

                        if delta.content:
                            has_yielded = True
                            yield f"data: {json.dumps({'text': delta.content, 'is_done': False})}\n\n"

                        if delta.tool_calls:
                            has_yielded = True
                            for tc in delta.tool_calls:
                                idx = tc.index
                                if idx not in tool_calls_buffer:
                                    tool_calls_buffer[idx] = {
                                        "id": tc.id,
                                        "type": "function",
                                        "function": {
                                            "name": tc.function.name or "",
                                            "arguments": tc.function.arguments or "",
                                        },
                                    }
                                else:
                                    if tc.function.name:
                                        tool_calls_buffer[idx]["function"]["name"] += tc.function.name
                                    if tc.function.arguments:
                                        tool_calls_buffer[idx]["function"]["arguments"] += tc.function.arguments

                    if tool_calls_buffer:
                        calls_list = list(tool_calls_buffer.values())
                        yield f"data: {json.dumps({'tool_calls': calls_list, 'is_done': False})}\n\n"

                    latency_ms = int((time.perf_counter() - t0) * 1000)
                    ModelHealthTracker.record_call_background(
                        model_id=candidate["model"],
                        provider=cand_provider,
                        latency_ms=latency_ms,
                        success=True,
                    )

                    yield f"data: {json.dumps({'is_done': True})}\n\n"
                    return

                except Exception as e:
                    last_error = e
                    latency_ms = int((time.perf_counter() - t0) * 1000)
                    is_timeout = "timeout" in str(e).lower() or "socket" in str(e).lower()
                    ModelHealthTracker.record_call_background(
                        model_id=candidate["model"],
                        provider=cand_provider,
                        latency_ms=latency_ms,
                        success=False,
                        error=str(e),
                        is_timeout=is_timeout,
                    )
                    logging.warning(
                        "Planning streaming candidate %d (%s) attempt %d failed: %s",
                        i,
                        candidate["model"],
                        attempt,
                        e,
                    )
                    if has_yielded:
                        yield f"data: {json.dumps({'error': str(e), 'is_done': True})}\n\n"
                        return

        if last_error:
            yield f"data: {json.dumps({'error': str(last_error), 'is_done': True})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
