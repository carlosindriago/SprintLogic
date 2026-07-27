"""Tool model mapping repository.

Each tool in the system can optionally override the global DEFAULT_LLM_MODEL.
If no override is stored, the tool falls back to DEFAULT_LLM_MODEL.
"""
import logging
from typing import TypedDict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.config import DEFAULT_LLM_MODEL
from app.infrastructure.db.models import ToolModelMappingModel

logger = logging.getLogger(__name__)


class ToolDef(TypedDict):
    display_name: str
    description: str


KNOWN_TOOLS: dict[str, ToolDef] = {
    "chat": {
        "display_name": "SprintLogic Chat",
        "description": "Asistente de chat principal del IDE — responde preguntas, revisa codigo, propone soluciones",
    },
    "graph_analysis": {
        "display_name": "Analisis IA del Grafo",
        "description": "Auditoria arquitectonica del grafo de dependencias — detecta anomalias, deuda tecnica y patrones",
    },
    "insight_worker": {
        "display_name": "Consolidacion de Memoria",
        "description": "Worker en background que extrae aprendizajes y anti-patrones de conversaciones pasadas",
    },
    "code_coach": {
        "display_name": "Code Coach",
        "description": "Evaluador de calidad de codigo — analiza snippets y sugiere mejoras de patrones, seguridad y estilo",
    },
    "auto_fix": {
        "display_name": "Auto Fix",
        "description": "Refactorizacion automatica de archivos — aplica correcciones sugeridas por el Code Coach o el Chat",
    },
    "fim": {
        "display_name": "Relleno Predictivo (FIM)",
        "description": "Fill-in-the-Middle — sugiere completaciones de codigo inline mientras escribis en el editor",
    },
    "contextual_mentor": {
        "display_name": "Mentoria Contextual",
        "description": "Analisis pedagogico del archivo abierto en el editor — detecta anti-patrones y explica por que",
    },
    "chat_sensei": {
        "display_name": "Modo Sensei",
        "description": "Chat en modo Arquitecto Socratico — debate decisiones de diseno y evalua tradeoffs",
    },
    "ticket_mentor": {
        "display_name": "Ticket Mentor",
        "description": "Asistente de tickets Kanban — analiza el archivo afectado y el blast radius de dependencias",
    },
    "phantom_extractor": {
        "display_name": "Phantom Extractor",
        "description": "Extrae tickets Kanban accionables a partir de reportes de analisis arquitectonico",
    },
    "planning_studio": {
        "display_name": "Planning Studio",
        "description": "Asistente de planificacion — genera WBS, tareas y roadmaps a partir de requerimientos",
    },
    "chat_title_gen": {
        "display_name": "Generador de Titulos",
        "description": "Genera titulos cortos y descriptivos para nuevas conversaciones del chat",
    },
}


def parse_default_model() -> tuple[str, str]:
    """Parse DEFAULT_LLM_MODEL into (provider, model_id)."""
    if "/" in DEFAULT_LLM_MODEL:
        provider, model = DEFAULT_LLM_MODEL.split("/", 1)
    else:
        provider = model = DEFAULT_LLM_MODEL
    return provider, model


async def get_tool_model(
    session: AsyncSession, tool_name: str
) -> tuple[str, str] | None:
    """Return (provider_id, model_name) if the tool has an explicit override.

    Returns None when the tool is not overridden — the caller should then use
    the global DEFAULT_LLM_MODEL (or its own fallback).
    """
    result = await session.execute(
        select(ToolModelMappingModel).where(
            ToolModelMappingModel.tool_name == tool_name
        )
    )
    mapping = result.scalars().first()
    if mapping is None:
        return None
    return mapping.provider_id, mapping.model_name


async def list_tool_mappings(session: AsyncSession) -> list[dict]:
    """Return all stored tool → model overrides with tool display metadata."""
    result = await session.execute(select(ToolModelMappingModel))
    stored = result.scalars().all()

    stored_map: dict[str, tuple[str, str]] = {
        m.tool_name: (m.provider_id, m.model_name) for m in stored
    }

    default_provider, default_model_id = parse_default_model()

    tools = []
    for tool_name, tool_def in KNOWN_TOOLS.items():
        entry = stored_map.get(tool_name)
        tools.append({
            "tool_name": tool_name,
            "display_name": tool_def["display_name"],
            "description": tool_def["description"],
            "provider_id": entry[0] if entry else None,
            "model_name": entry[1] if entry else None,
            "is_overridden": entry is not None,
            "default_provider": default_provider,
            "default_model": default_model_id,
            "effective_provider": entry[0] if entry else default_provider,
            "effective_model": entry[1] if entry else default_model_id,
        })
    return tools


async def upsert_tool_mapping(
    session: AsyncSession,
    tool_name: str,
    provider_id: str,
    model_name: str,
) -> ToolModelMappingModel:
    """Create or update a tool → model override."""
    import uuid as _uuid

    result = await session.execute(
        select(ToolModelMappingModel).where(
            ToolModelMappingModel.tool_name == tool_name
        )
    )
    existing = result.scalars().first()

    if existing:
        existing.provider_id = provider_id
        existing.model_name = model_name
        await session.flush()
        return existing

    mapping = ToolModelMappingModel(
        id=str(_uuid.uuid4()),
        tool_name=tool_name,
        provider_id=provider_id,
        model_name=model_name,
    )
    session.add(mapping)
    await session.flush()
    return mapping


async def delete_tool_mapping(session: AsyncSession, tool_name: str) -> bool:
    """Remove a tool override so it falls back to DEFAULT_LLM_MODEL. Returns True if deleted."""
    result = await session.execute(
        select(ToolModelMappingModel).where(
            ToolModelMappingModel.tool_name == tool_name
        )
    )
    mapping = result.scalars().first()
    if mapping is None:
        return False
    await session.delete(mapping)
    await session.flush()
    return True
