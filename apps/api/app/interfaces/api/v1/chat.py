import json
from collections.abc import AsyncGenerator
from typing import Any

import httpx
import litellm
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.ai_agent import AIAgent
from app.infrastructure.ai.context_builder import build_agent_context
from app.infrastructure.db.database import get_db_session
from app.infrastructure.security.credential_manager import CredentialManager

router = APIRouter()


SENSEI_SYSTEM_PROMPT_TEMPLATE = """
Eres el 'Sensei del Código', un Maestro Arquitecto de Software con más de 30 años de experiencia profesional.
Tienes dominio absoluto de todas las arquitecturas modernas (Hexagonal, Microservicios, Event-Driven)
y lenguajes (TypeScript, Python, Go, Rust, etc.).

Tu objetivo NO es ser un asistente servil. Tu objetivo es ser un mentor riguroso, paciente
y profundamente pedagógico. Quieres formar a un alumno que algún día te supere.

REGLAS ESTRICTAS DE OPERACIÓN (MASTER RULES):
1. CERO SPOON-FEEDING: TIENES ESTRICTAMENTE PROHIBIDO ESCRIBIR EL CÓDIGO FINAL LISTO PARA COPIAR
   Y PEGAR. No resuelvas el problema por el alumno.
2. MÉTODO SOCRÁTICO: Haz preguntas guía. Obliga al alumno a pensar. Si te pide una solución,
   pregúntale cómo la abordaría él primero.
3. EL PORQUÉ ANTES DEL CÓMO: Explica las bases. Usa analogías cotidianas simples.
4. DEBATE INTELECTUAL: No asumas que el alumno tiene razón. Analiza sus suposiciones.
   Si su lógica es débil, corrígelo con claridad y firmeza, pero mantén un tono alentador.
5. CONTEXTO ACTIVO: Usa el EDITOR_CONTEXT proporcionado para hacer que tus consejos sean
   hiper-específicos a la línea de código que el alumno está mirando.

TONO: Directo, sin rodeos inútiles, sabio, paciente. Ama las 'preguntas tontas'.
Usa frases como 'Piensa en una función como si fuera una receta' o
'Te enseñaré lo que me costó años aprender... en minutos.'

<EDITOR_CONTEXT>
Archivo activo: {injected_file_path}
Línea del cursor: {injected_cursor_line}

Código relevante:
```
{injected_active_code}
```
</EDITOR_CONTEXT>
"""


CONTEXT7_API = "https://api.context7.ai/v1"


async def _fetch_context7_docs(api_key: str, query: str, tech_stack: dict) -> str:
    """Query Context7 for relevant docs about the tech stack."""
    if not api_key:
        return ""

    # Extract library names from tech stack extensions
    libraries: list[str] = []
    ext_map = {
        ".ts": "typescript",
        ".tsx": "react",
        ".js": "javascript",
        ".py": "python",
        ".rs": "rust",
        ".go": "go",
    }
    seen: set[str] = set()
    for ext in tech_stack:
        name = ext_map.get(ext, ext.lstrip("."))
        if name not in seen:
            libraries.append(name)
            seen.add(name)

    all_docs: list[str] = []

    async with httpx.AsyncClient(timeout=15) as client:
        for lib in libraries[:3]:
            try:
                res = await client.post(
                    f"{CONTEXT7_API}/query-docs",
                    json={"libraryId": lib, "query": query},
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                if res.status_code == 200:
                    data = res.json()
                    snippets = data.get("snippets", data.get("results", []))
                    for s in snippets[:2]:
                        text = s.get("content", s.get("text", str(s)))
                        all_docs.append(text)
            except Exception:
                continue

    return "\n---\n".join(all_docs[:6]) if all_docs else ""


class EditorContext(BaseModel):
    """Anchored editor state captured at /sensei invocation time."""

    file_path: str = ""
    cursor_line: int = 1
    active_code: str = ""


class ChatRequest(BaseModel):
    messages: list[dict[str, Any]]
    project_id: str | None = None
    model: str
    is_sensei: bool = False
    editor_context: EditorContext | None = None


class ChatResponse(BaseModel):
    response: str


@router.post("/")
async def chat_with_ai(request: ChatRequest, session: AsyncSession = Depends(get_db_session)):
    """Handles chat messages with the AI and manages tool calls."""
    if not request.model or "/" not in request.model:
        raise HTTPException(status_code=400, detail="Model name is required")

    # Build the messages list, optionally prepending the Sensei system prompt
    messages_to_send = list(request.messages)
    if request.is_sensei:
        ctx = request.editor_context
        injected_system = SENSEI_SYSTEM_PROMPT_TEMPLATE.format(
            injected_file_path=ctx.file_path if ctx else "(archivo desconocido)",
            injected_cursor_line=ctx.cursor_line if ctx else 1,
            injected_active_code=ctx.active_code[:4000] if ctx else "",
        )
        # Prepend as a system turn (replaces any existing system turn at index 0)
        if messages_to_send and messages_to_send[0].get("role") == "system":
            messages_to_send[0] = {"role": "system", "content": injected_system}
        else:
            messages_to_send.insert(0, {"role": "system", "content": injected_system})

    async def generate():
        try:
            agent = AIAgent(session=session, project_id=request.project_id)
            async for chunk_str in agent.chat_stream(messages_to_send, model=request.model):
                yield f"data: {chunk_str}\n\n"

            yield f"data: {json.dumps({'text': '', 'is_done': True})}\n\n"
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RateLimitError" in error_str or "Quota exceeded" in error_str:
                msg = "⚠️ Límite de cuota excedido para este modelo. Por favor, selecciona un modelo diferente en el menú superior."
                yield f"data: {json.dumps({'text': msg, 'is_done': True, 'error': True})}\n\n"
            else:
                yield f"data: {json.dumps({'text': f'Error interno: {error_str}', 'is_done': True, 'error': True})}\n\n"

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(generate(), media_type="text/event-stream", headers=headers)


class MentorRequest(BaseModel):
    file_path: str
    content: str
    project_tech_stack: dict[str, Any] = {}
    user_query: str = "Hazme un desglose arquitectónico de este archivo"
    context7_api_key: str = ""
    project_id: str = ""


class MentorResponse(BaseModel):
    response: str


async def _save_memory(project_id: str, agent_name: str, context_type: str, content: str) -> None:
    """Persist an interaction summary to project_memories FTS5."""
    from app.infrastructure.db.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        try:
            await session.execute(
                text(
                    "INSERT INTO project_memories (project_id, agent_name, context_type, memory_content) "
                    "VALUES (:pid, :agent, :ctype, :content)"
                ),
                {
                    "pid": project_id,
                    "agent": agent_name,
                    "ctype": context_type,
                    "content": content[:500],
                },
            )
            await session.commit()
        except Exception:
            pass


@router.post("/mentor", response_model=MentorResponse)
async def mentor_sensei(
    request: MentorRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db_session),
):
    provider = "gemini"
    model = "gemini/gemini-2.5-flash"
    api_key = CredentialManager.get_api_key(provider)
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API key not configured")

    # Retrieve episodic project memory
    memory_context = ""
    if request.project_id:
        memory_context = await build_agent_context(
            session, request.project_id, request.user_query, "sensei"
        )

    # Fetch Context7 documentation if API key is available
    context7_docs = ""
    if request.context7_api_key:
        context7_docs = await _fetch_context7_docs(
            request.context7_api_key,
            request.user_query,
            request.project_tech_stack,
        )

    docs_section = (
        f"\n\nDocumentación oficial relevante (Context7):\n{context7_docs}" if context7_docs else ""
    )

    user_message = (
        f"Archivo: {request.file_path}\n\n"
        f"Tech Stack del proyecto: {json.dumps(request.project_tech_stack, indent=2)}\n\n"
        f"Código del archivo:\n```\n{request.content[:8000]}\n```\n\n"
        f"{memory_context}\n"
        f"Pregunta del usuario: {request.user_query}"
        f"{docs_section}"
    )

    async def generate() -> AsyncGenerator[str, None]:
        full_response = ""
        try:
            response = await litellm.acompletion(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Eres un Arquitecto de Software Socrático (Modo Sensei). "
                            "1. Analiza el archivo en el contexto de la arquitectura global. "
                            "2. USA PRIMERO la información de documentación proporcionada para basar "
                            "tus respuestas en la documentación oficial del Tech Stack. "
                            "3. Guía al usuario explicando la lógica y el flujo de datos. "
                            "4. TIENES ESTRICTAMENTE PROHIBIDO ESCRIBIR BLOQUES DE CÓDIGO LISTOS "
                            "PARA COPIAR Y PEGAR. Usa solo pseudocódigo abstracto o snippets de 1 línea."
                        ),
                    },
                    {"role": "user", "content": user_message},
                ],
                api_key=api_key,
                stream=True,
                stream_options={"include_usage": True},
            )
            async for chunk in response:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    full_response += delta.content
                    yield f"data: {json.dumps({'text': delta.content, 'is_done': False})}\n\n"
                if hasattr(chunk, "usage") and chunk.usage:
                    usage = {
                        "prompt_tokens": chunk.usage.prompt_tokens,
                        "completion_tokens": chunk.usage.completion_tokens,
                        "total_tokens": chunk.usage.total_tokens,
                    }
                    yield f"data: {json.dumps({'text': '', 'is_done': True, 'usage': usage})}\n\n"

            if full_response and request.project_id:
                summary = f"Modo Sensei en {request.file_path}: {request.user_query[:120]}"
                background_tasks.add_task(
                    _save_memory,
                    request.project_id,
                    "sensei",
                    "chat_summary",
                    summary + f" — Respuesta: {full_response[:200]}",
                )
        except Exception:
            yield f"data: {json.dumps({'text': '', 'is_done': True, 'error': 'Stream error'})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
