from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.infrastructure.db.models import PromptRegistryModel
from typing import Optional, Dict
import asyncio

_prompt_cache: Dict[str, PromptRegistryModel] = {}

IRON_PROMPT_V5_ID = "architect_report_v5"
IRON_PROMPT_V5_CONTENT = """Eres un Principal Software Architect realizando el onboarding y la auditoría inicial de un proyecto de software.
Tu objetivo es emitir un reporte estratégico, denso en valor técnico y accionable para los desarrolladores.

Tienes acceso al <contexto_del_proyecto> que incluye: el árbol de directorios, los archivos de configuración (para deducir el stack) y el código fuente de las 3 clases/orquestadores más centrales del sistema detectados matemáticamente.

REGLA DE ORO: No alucines dependencias, no cuentes archivos y no asumas errores estáticos. Enfócate estrictamente en la semántica, la seguridad, los flujos de ejecución y el diseño del dominio basándote en el código inyectado.

Estructura tu reporte ESTRICTAMENTE bajo estos apartados en Markdown:

**1. Puntos Críticos de Seguridad y Resiliencia (Severidad Alta):**
Analiza el flujo de autenticación, manejo de sesiones, y si las reglas de seguridad están centralizadas o dispersas (dedúcelo de las configs y el código provisto).

**2. Arquitectura de Dominio y Puntos Clave de Entrada (El Mapa):**
Define la arquitectura (ej. Hexagonal, Feature-Sliced). Señala dónde arranca la ejecución y cuáles parecen ser las entidades del *Core Business*.

**3. Deuda Técnica Real y Estado del Código (Severidad Media):**
Revisa el código fuente inyectado. ¿Hay fugas de dominio (ej. SQL en controladores)? ¿Es un código limpio, usa inyección de dependencias, o hay acoplamiento duro? Evalúa las prácticas de testing si ves carpetas de pruebas en el árbol de directorios.

**4. Guía de Contribución y Quick Wins:**
Si un desarrollador nuevo entra mañana, ¿cuál debería ser el estándar a seguir basándose en lo que ves? Para la sección 4, propón 3 mejoras accionables utilizando **únicamente viñetas de texto plano (bullet points)**. Tienes estrictamente prohibido utilizar formatos XML, JSON o etiquetas de código para estas acciones.

Ruta del proyecto: {project_path}
Nombre del proyecto: {project_name}

{project_context_xml}

{metrics_xml}

{skeletons_xml}
"""
IRON_PROMPT_V5_VARS = ["project_path", "project_name", "project_context_xml", "metrics_xml", "skeletons_xml"]

PHANTOM_EXTRACTOR_ID = "phantom_extractor"
PHANTOM_EXTRACTOR_CONTENT = """Extract actionable Kanban tickets from the report below.

Report:
{report_text}

Respond strictly in JSON format matching exactly this schema: {"tickets": [{"title": "...", "description": "..."}]}
"""
PHANTOM_EXTRACTOR_VARS = ["report_text"]

async def initialize_prompts(session: AsyncSession):
    prompts_to_init = [
        {
            "id": IRON_PROMPT_V5_ID,
            "description": "Golden prompt for architectural onboarding (V5)",
            "content": IRON_PROMPT_V5_CONTENT,
            "required_variables": IRON_PROMPT_V5_VARS
        },
        {
            "id": PHANTOM_EXTRACTOR_ID,
            "description": "Phantom Extractor for Kanban tickets",
            "content": PHANTOM_EXTRACTOR_CONTENT,
            "required_variables": PHANTOM_EXTRACTOR_VARS
        }
    ]

    for p in prompts_to_init:
        result = await session.execute(select(PromptRegistryModel).filter_by(id=p["id"]))
        existing = result.scalars().first()
        if not existing:
            new_prompt = PromptRegistryModel(
                id=p["id"],
                description=p["description"],
                content=p["content"],
                required_variables=p["required_variables"]
            )
            session.add(new_prompt)
            await session.flush()
            _prompt_cache[p["id"]] = new_prompt
        else:
            _prompt_cache[p["id"]] = existing

    await session.commit()

async def get_prompt_async(session: AsyncSession, prompt_id: str) -> Optional[PromptRegistryModel]:
    if prompt_id in _prompt_cache:
        return _prompt_cache[prompt_id]
    
    result = await session.execute(select(PromptRegistryModel).filter_by(id=prompt_id))
    prompt = result.scalars().first()
    if prompt:
        _prompt_cache[prompt_id] = prompt
    return prompt

def get_prompt(session: Optional[AsyncSession], prompt_id: str) -> Optional[PromptRegistryModel]:
    """Synchronous read for places without session"""
    return _prompt_cache.get(prompt_id)

async def update_prompt(session: AsyncSession, prompt_id: str, new_content: str, required_variables: list) -> PromptRegistryModel:
    result = await session.execute(select(PromptRegistryModel).filter_by(id=prompt_id))
    prompt = result.scalars().first()
    if not prompt:
        raise ValueError(f"Prompt {prompt_id} not found")
    
    prompt.content = new_content
    prompt.required_variables = required_variables
    await session.commit()
    await session.refresh(prompt)
    _prompt_cache[prompt_id] = prompt
    return prompt

async def get_all_prompts(session: AsyncSession) -> list[PromptRegistryModel]:
    result = await session.execute(select(PromptRegistryModel))
    return result.scalars().all()

async def restore_prompt(session: AsyncSession, prompt_id: str) -> PromptRegistryModel:
    result = await session.execute(select(PromptRegistryModel).filter_by(id=prompt_id))
    prompt = result.scalars().first()
    if not prompt:
        raise ValueError(f"Prompt {prompt_id} not found")
    
    # Restore from default golden prompts
    golden_content = ""
    if prompt_id == IRON_PROMPT_V5_ID:
        golden_content = IRON_PROMPT_V5_CONTENT
    elif prompt_id == PHANTOM_EXTRACTOR_ID:
        golden_content = PHANTOM_EXTRACTOR_CONTENT
    else:
        raise ValueError(f"No golden content available for {prompt_id}")
        
    prompt.content = golden_content
    await session.commit()
    await session.refresh(prompt)
    _prompt_cache[prompt_id] = prompt
    return prompt
