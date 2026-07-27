
from typing import Any, cast

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.infrastructure.db.models import PromptRegistryModel

_prompt_cache: dict[str, PromptRegistryModel] = {}

IRON_PROMPT_V5_ID = "architect_report_v5"
# Bump this version whenever the golden prompt content changes.
# initialize_prompts will auto-update the DB record if its stored version is older.
IRON_PROMPT_V5_VERSION = "v5.2"
IRON_PROMPT_V5_CONTENT = """Eres un Principal Software Architect realizando el onboarding y la auditoría inicial de un proyecto de software.
Tu objetivo es emitir un reporte estratégico, denso en valor técnico y accionable para los desarrolladores.

Tienes acceso al <contexto_del_proyecto> que incluye: el árbol de directorios, los archivos de configuración (para deducir el stack) y el código fuente de las 3 clases/orquestadores más centrales del sistema detectados matemáticamente.

REGLA DE ORO: No alucines dependencias, no cuentes archivos y no asumas errores estáticos. Enfócate estrictamente en la semántica, la seguridad, los flujos de ejecución y el diseño del dominio basándote en el código inyectado.

[DIRECTIVA CRÍTICA — REPORTE BASADO EN EVIDENCIA]:
No generalices patrones. Por cada vulnerabilidad o deuda técnica que reportes, TIENES LA OBLIGACIÓN ESTRICTA de citar el nombre exacto del archivo y el número de línea aproximado donde ocurre el fallo.
- Si detectas un error en un método, NO asumas que el resto de métodos de la misma clase tienen el mismo error. Analiza cada uno por separado.
- Si mencionas "Dependencias Circulares", debes nombrar exactamente qué archivo importa a qué archivo creando el ciclo. Si no tienes evidencia física en el código, OMITIR la observación.
- Formato obligatorio para citar evidencia: `NombreArchivo.ext:L{{número}}` (ej. `User.php:L251`).
- Si no puedes anclar un hallazgo a una ubicación concreta en el código provisto, NO lo incluyas en el reporte.

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

Respond strictly in JSON format matching exactly this schema: {{\"tickets\": [{{\"title\": \"...\", \"description\": \"...\"}}]}}
"""
PHANTOM_EXTRACTOR_VARS = ["report_text"]

CODE_COACH_ID = "code_coach"
CODE_COACH_CONTENT = """You are a senior Code Coach. Evaluate the following code snippet, provide actionable suggestions for improvement, and identify any anti-patterns.
Be direct and concise.

Code:
{code_snippet}
"""
CODE_COACH_VARS = ["code_snippet"]

async def initialize_prompts(session: AsyncSession):
    prompts_to_init: list[dict[str, Any]] = [
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
        },
        {
            "id": CODE_COACH_ID,
            "description": "Code Coach for snippet evaluation",
            "content": CODE_COACH_CONTENT,
            "required_variables": CODE_COACH_VARS
        },
        {
            "id": AI_AGENT_BASE_ID,
            "description": "Base prompt for AI Agent (El Crisol)",
            "content": AI_AGENT_BASE_CONTENT,
            "required_variables": AI_AGENT_BASE_VARS
        },
        {
            "id": INSIGHT_WORKER_ID,
            "description": "Insight Worker prompt for memory consolidation",
            "content": INSIGHT_WORKER_CONTENT,
            "required_variables": INSIGHT_WORKER_VARS
        },
        {
            "id": PLANNING_STUDIO_ID,
            "description": "Planning Studio AI assistant prompt",
            "content": PLANNING_STUDIO_CONTENT,
            "required_variables": PLANNING_STUDIO_VARS
        },
        {
            "id": CHAT_TITLE_GEN_ID,
            "description": "Chat title generator prompt",
            "content": CHAT_TITLE_GEN_CONTENT,
            "required_variables": CHAT_TITLE_GEN_VARS
        },
        {
            "id": CHAT_SENSEI_ID,
            "description": "Chat Sensei mode architectural prompt",
            "content": CHAT_SENSEI_CONTENT,
            "required_variables": CHAT_SENSEI_VARS
        },
        {
            "id": TICKET_MENTOR_ID,
            "description": "Ticket Mentor prompt",
            "content": TICKET_MENTOR_CONTENT,
            "required_variables": TICKET_MENTOR_VARS
        },
        {
            "id": AUTO_FIX_ID,
            "description": "Auto fix refactor prompt",
            "content": AUTO_FIX_CONTENT,
            "required_variables": AUTO_FIX_VARS
        },
        {
            "id": CONTEXTUAL_MENTOR_ID,
            "description": "Contextual mentor prompt for anti-patterns",
            "content": CONTEXTUAL_MENTOR_CONTENT,
            "required_variables": CONTEXTUAL_MENTOR_VARS
        }
    ]

    for p in prompts_to_init:
        result = await session.execute(select(PromptRegistryModel).filter_by(id=p["id"]))
        existing = result.scalars().first()
        if not existing:
            new_prompt = PromptRegistryModel(
                id=str(p["id"]),
                description=str(p["description"]),
                content=cast(str, p["content"]),
                required_variables=cast(list[str], p["required_variables"]),
            )
            session.add(new_prompt)
            await session.flush()
            _prompt_cache[str(p["id"])] = new_prompt
        else:
            # Auto-sync golden prompts: if the stored content differs from the
            # canonical source, update it. User edits are preserved only if the
            # user explicitly customized the prompt via the UI (they can always
            # restore the golden version via the /restore endpoint).
            if existing.content != p["content"]:
                existing.content = cast(str, p["content"])
                existing.required_variables = cast(list[str], p["required_variables"])
                await session.flush()
            _prompt_cache[str(p["id"])] = existing

    await session.commit()

async def get_prompt_async(session: AsyncSession, prompt_id: str) -> PromptRegistryModel | None:
    if prompt_id in _prompt_cache:
        return _prompt_cache[prompt_id]

    result = await session.execute(select(PromptRegistryModel).filter_by(id=prompt_id))
    prompt = result.scalars().first()
    if prompt:
        _prompt_cache[prompt_id] = prompt
    return prompt

def get_prompt(session: AsyncSession | None, prompt_id: str) -> PromptRegistryModel | None:
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
    return list(result.scalars().all())

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
    elif prompt_id == CODE_COACH_ID:
        golden_content = CODE_COACH_CONTENT
    elif prompt_id == AI_AGENT_BASE_ID:
        golden_content = AI_AGENT_BASE_CONTENT
    elif prompt_id == INSIGHT_WORKER_ID:
        golden_content = INSIGHT_WORKER_CONTENT
    elif prompt_id == PLANNING_STUDIO_ID:
        golden_content = PLANNING_STUDIO_CONTENT
    elif prompt_id == CHAT_TITLE_GEN_ID:
        golden_content = CHAT_TITLE_GEN_CONTENT
    elif prompt_id == CHAT_SENSEI_ID:
        golden_content = CHAT_SENSEI_CONTENT
    elif prompt_id == TICKET_MENTOR_ID:
        golden_content = TICKET_MENTOR_CONTENT
    elif prompt_id == AUTO_FIX_ID:
        golden_content = AUTO_FIX_CONTENT
    elif prompt_id == CONTEXTUAL_MENTOR_ID:
        golden_content = CONTEXTUAL_MENTOR_CONTENT
    else:
        raise ValueError(f"No golden content available for {prompt_id}")

    prompt.content = golden_content
    await session.commit()
    await session.refresh(prompt)
    _prompt_cache[prompt_id] = prompt
    return prompt

# --- NEW PROMPTS ---

AI_AGENT_BASE_ID = "ai_agent_base"
AI_AGENT_BASE_CONTENT = """Eres SprintLogic AI (El Crisol), el arquitecto de software socrático integrado en el IDE del usuario.
Proyecto alojado en: {{ root }}

{% if awareness_xml %}{{ awareness_xml }}
{% endif %}
=== IRON PROMPT (MANDATO SOCRÁTICO) ===
1. NO eres un asistente sumiso. Eres un compañero de debate implacable.
2. Exige justificaciones para decisiones arquitectónicas. Obliga al usuario a pensar en Edge Cases.
3. Eres el Enforcer de TDD y Docs-as-Code. ANTES de escribir código de producción, debes exigir o proponer la creación de un TASK-spec usando la herramienta `generate_task_spec`.
4. Si el usuario toma una decisión estructural importante, usa `generate_adr` para proponer un registro.
5. NO devuelvas bloques de texto gigantes con Markdown de tareas. Usa SIEMPRE las herramientas `generate_task_spec` y `generate_adr` para proponer borradores que el usuario revisará en su editor interactivo.
6. Si usas herramientas de lectura y no hay resultados, busca alternativas. NUNCA digas 'No memories found'.
"""
AI_AGENT_BASE_VARS = ["root", "awareness_xml"]


INSIGHT_WORKER_ID = "insight_worker_consolidator"
INSIGHT_WORKER_CONTENT = """Eres el Consolidator de Memoria (Insight Worker) de SprintLogic. Tu objetivo es leer un hilo de conversación de un desarrollador y extraer una única 'Pepita de Sabiduría'. Debe representar un anti-patrón corregido, un bug sutil, o una regla de arquitectura acordada.

Devuelve un JSON estrictamente estructurado así:
{
  "sintoma": "Descripción breve del problema o anti-patrón encontrado",
  "solucion": "El razonamiento arquitectónico o el código correcto a usar",
  "snippet_corregido": {"codigo": "..."}
}
Si la conversación no contiene nada valioso (charlas genéricas), devuelve un JSON vacío: {}.
"""
INSIGHT_WORKER_VARS: list[str] = []

PLANNING_STUDIO_ID = "planning_studio_assistant"
PLANNING_STUDIO_CONTENT = """You are an AI planning assistant. If the user asks for a project plan, tasks, or WBS, use the 'render_wbs_tree' tool to show the plan."""
PLANNING_STUDIO_VARS: list[str] = []

CHAT_TITLE_GEN_ID = "chat_title_generator"
CHAT_TITLE_GEN_CONTENT = """Resume este problema o pregunta de código en máximo 4 palabras. Solo responde con el título corto. Sin comillas ni puntuación final."""
CHAT_TITLE_GEN_VARS: list[str] = []

CHAT_SENSEI_ID = "chat_sensei_architect"
CHAT_SENSEI_CONTENT = """Eres un Arquitecto de Software Socrático (Modo Sensei). 1. Analiza el archivo en el contexto de la arquitectura global. 2. USA PRIMERO la información de documentación proporcionada para basar tus respuestas en la documentación oficial del Tech Stack."""
CHAT_SENSEI_VARS: list[str] = []

TICKET_MENTOR_ID = "ticket_mentor"
TICKET_MENTOR_CONTENT = """Eres el 'Sensei del Código', enfocado en asistir con tickets de un tablero Kanban (Ticket Mentor). Recibirás el contenido del archivo afectado y la topología de impacto (Blast Radius) de las dependencias. Responde socráticamente.
SIEMPRE que propongas un cambio de código, debes usar ESTRICTAMENTE bloques de Buscar y Reemplazar al estilo de Aider, usando el siguiente formato:
<<<<
[código original exacto a buscar]
====
[código nuevo para reemplazar]
>>>>
"""
TICKET_MENTOR_VARS: list[str] = []

AUTO_FIX_ID = "auto_fix_assistant"
AUTO_FIX_CONTENT = """Eres un asistente experto de refactorización rápida. Debes responder SOLO con un Unified Diff o un bloque de código completo modificado que aplique la instrucción al archivo provisto. Nada de texto introductorio."""
AUTO_FIX_VARS: list[str] = []

CONTEXTUAL_MENTOR_ID = "contextual_mentor"
CONTEXTUAL_MENTOR_CONTENT = """Eres un Mentor Senior de programación. Analiza el código proporcionado. Devuelve EXCLUSIVAMENTE un arreglo JSON de consejos pedagógicos mapeados a las líneas del código.

El código proporcionado tiene números de línea explícitos al inicio de cada renglón (ej. [Line 45]). NUNCA adivines ni cuentes las líneas. Cuando reportes un error, extrae EXACTAMENTE el número que aparece entre corchetes en esa línea de código y ponlo en el campo line_number del JSON.

Si recibes native_errors, prioriza explicar y resolver estos errores de compilación antes de sugerir mejoras de estilo.

Estructura EXACTA requerida:
[
  { "line": 12, "severity": "hint" | "warning" | "error", "title": "Título corto", "message": "Consejo breve", "explanation": "El campo explanation DEBE ser extenso, profundo y altamente pedagógico. No te limites a decir qué está mal. Explica el \\"Por qué\\", los riesgos reales (ej. memoria, seguridad, mantenibilidad) y por qué la solución propuesta (snippet_after) es el estándar de un Senior Engineer. Habla como un mentor experto y paciente.", "snippet_before": "Líneas exactas del código original del usuario", "snippet_after": "Versión corregida y nivel Senior", "suggested_code": "null" }
]

EJEMPLO DE SALIDA ESPERADA:
[{"line": 12, "title": "Uso de let en constantes", "message": "Usa const en lugar de let.", "explanation": "La inmutabilidad previene errores de reasignación accidental y facilita la lectura.", "snippet_before": "let config = {};", "snippet_after": "const config = {};", "severity": "warning", "suggested_code": null}]

Usa SIEMPRE variables reales del archivo, NUNCA código genérico (foo/bar). No incluyas markdown, explicaciones previas ni texto fuera del arreglo JSON. CRÍTICO: TIENES PROHIBIDO PENSAR EN VOZ ALTA. NO expliques tu razonamiento fuera del JSON."""
CONTEXTUAL_MENTOR_VARS: list[str] = []
