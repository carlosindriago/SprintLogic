import json
from collections.abc import AsyncGenerator
from typing import Any

import httpx
import litellm
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.ai_agent import AIAgent
from app.infrastructure.ai.context_builder import build_agent_context
from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.models import ConversationModel, MessageModel
from app.infrastructure.security.credential_manager import CredentialManager

router = APIRouter()


SENSEI_SYSTEM_PROMPT_TEMPLATE = """Eres el 'Sensei del Código', un Maestro Arquitecto de Software con más de 30 años de experiencia profesional. Dominas todos los lenguajes, frameworks y arquitecturas modernas.
Tu objetivo es ser un compañero de debate intelectual y un mentor riguroso. No eres un asistente servil. Quieres formar a un alumno que algún día te supere.

REGLAS ESTRICTAS DE OPERACIÓN (MASTER RULES):
1. CERO SPOON-FEEDING: NUNCA escribas el código final listo para copiar y pegar. No resuelvas el problema por el alumno.
2. MÉTODO SOCRÁTICO Y DEBATE: Si el alumno presenta una idea, analiza sus suposiciones. Ofrece contrapuntos. Si se equivoca, corrígelo con claridad y firmeza. Prioriza la verdad por encima del acuerdo.
3. EL PORQUÉ ANTES DEL CÓMO: Explica las bases. Usa analogías cotidianas simples ('Vamos paso a paso, como si estuviéramos enseñándole a mi abuela a programar su primer robot').
4. VERSATILIDAD PEDAGÓGICA: Puedes enseñar desde cero (ej. un nuevo lenguaje) o analizar el código existente.
5. MANEJO DEL CONTEXTO: Recibirás un <EDITOR_CONTEXT>. Si la pregunta del usuario es sobre ese código, úsalo para ser hiper-específico. SI LA PREGUNTA ES GENERAL o pide aprender algo desde cero, IGNORA el contexto del editor; no dejes que te confunda.

TONO: Directo, sin rodeos inútiles, paciente, detallista y alentador. Ama las 'preguntas tontas'. No asumas que el alumno sabe algo: valida, pregunta y adapta tu nivel."""


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
    open_tabs: list[str] = []


class ChatRequest(BaseModel):
    messages: list[dict[str, Any]]
    project_id: str | None = None
    model: str | None = None
    is_sensei: bool = False
    editor_context: EditorContext | None = None
    conversation_id: int | None = None


class ChatResponse(BaseModel):
    response: str


async def _generate_conversation_title(conversation_id: int, first_message: str):
    """Background task to generate a short title for a new conversation."""
    from app.infrastructure.db.database import AsyncSessionLocal

    # Pre-emptive short title to display immediately
    short_preview = " ".join(first_message.split()[:4]) + "..."
    async with AsyncSessionLocal() as session:
        try:
            # Fallback title just in case the LLM fails
            conv = await session.get(ConversationModel, conversation_id)
            if conv and not conv.title:
                conv.title = short_preview
                await session.commit()

            from app.infrastructure.config import DEFAULT_LLM_MODEL
            # Request LLM for a better title

            provider = DEFAULT_LLM_MODEL.split("/")[0] if "/" in DEFAULT_LLM_MODEL else DEFAULT_LLM_MODEL
            api_key = CredentialManager.get_api_key(f"sprintlogic_{provider}") or CredentialManager.get_api_key(provider)
            if not api_key:
                api_key = CredentialManager.get_api_key("sprintlogic_openrouter")
                if not api_key:
                    return

            response = await litellm.acompletion(
                model=DEFAULT_LLM_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "Resume este problema o pregunta de código en máximo 4 palabras. Solo responde con el título corto. Sin comillas ni puntuación final."
                    },
                    {"role": "user", "content": first_message}
                ],
                api_key=api_key,
            )
            title = response.choices[0].message.content.strip().strip('"').strip("'")
            if len(title) > 50:
                title = title[:50]

            conv = await session.get(ConversationModel, conversation_id)
            if conv:
                conv.title = title
                await session.commit()
        except Exception:
            pass


@router.post("/")
async def chat_with_ai(request: ChatRequest, background_tasks: BackgroundTasks, session: AsyncSession = Depends(get_db_session)):
    """Handles chat messages with the AI and manages tool calls."""
    from app.infrastructure.config import DEFAULT_LLM_MODEL
    actual_model = request.model or DEFAULT_LLM_MODEL

    # DB Persistence setup
    conversation_id = request.conversation_id
    is_new_conversation = False
    if not conversation_id and request.project_id:
        import uuid
        try:
            project_uuid = uuid.UUID(request.project_id)
            conv = ConversationModel(project_id=project_uuid)
            session.add(conv)
            await session.commit()
            await session.refresh(conv)
            conversation_id = conv.id
            is_new_conversation = True
        except Exception as e:
            print(f"Failed to create conversation: {e}")

    # Build the messages list, optionally prepending the Sensei system prompt
    messages_to_send = list(request.messages)

    # Save the latest user message to DB
    user_content = ""
    for m in reversed(messages_to_send):
        if m.get("role") == "user":
            user_content = str(m.get("content", ""))
            break

    if conversation_id and user_content:
        user_msg = MessageModel(
            conversation_id=conversation_id,
            role="user",
            content=user_content
        )
        session.add(user_msg)
        await session.commit()

        if is_new_conversation:
            background_tasks.add_task(_generate_conversation_title, conversation_id, user_content)

    if request.is_sensei:
        injected_system = SENSEI_SYSTEM_PROMPT_TEMPLATE


        ctx = request.editor_context
        # Context decoupling: Only inject the <EDITOR_CONTEXT> block if we actually have code.
        # This prevents the LLM from getting confused by empty paths/lines when the user
        # asks a general question like "Teach me Rust from scratch".
        if ctx:
            if ctx.active_code.strip():
                injected_system += f"\n\n<EDITOR_CONTEXT>\nFile: {ctx.file_path}\nCursor Line: {ctx.cursor_line}\nActive Code:\n{ctx.active_code[:4000]}\n</EDITOR_CONTEXT>"
            if ctx.open_tabs:
                tabs_str = "\n".join([f"- {t}" for t in ctx.open_tabs])
                injected_system += f"\n\n<OPEN_TABS>\nEl usuario tiene las siguientes pestañas abiertas en el IDE:\n{tabs_str}\n</OPEN_TABS>"

        # Prepend as a system turn (replaces any existing system turn at index 0)
        if messages_to_send and messages_to_send[0].get("role") == "system":
            messages_to_send[0] = {"role": "system", "content": injected_system}
        else:
            messages_to_send.insert(0, {"role": "system", "content": injected_system})

    async def generate():
        full_response = ""
        try:
            agent = AIAgent(session=session, project_id=request.project_id)
            async for chunk_str in agent.chat_stream(messages_to_send, model=actual_model):
                # Try to parse the SSE json text manually to accumulate full text
                try:
                    chunk_data = json.loads(chunk_str)
                    if "text" in chunk_data:
                        full_response += chunk_data["text"]
                except Exception:
                    pass
                yield f"data: {chunk_str}\n\n"

            yield f"data: {json.dumps({'is_done': True, 'conversation_id': conversation_id})}\n\n"

            # Save the final AI response to DB
            if conversation_id and full_response:
                from app.infrastructure.db.database import AsyncSessionLocal
                async with AsyncSessionLocal() as bg_session:
                    ai_msg = MessageModel(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=full_response
                    )
                    bg_session.add(ai_msg)
                    await bg_session.commit()

        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RateLimitError" in error_str or "Quota exceeded" in error_str:
                msg = "⚠️ Límite de cuota excedido para este modelo. Por favor, selecciona un modelo diferente en el menú superior."
                yield f"data: {json.dumps({'text': msg, 'is_done': True, 'error': True, 'conversation_id': conversation_id})}\n\n"
            else:
                yield f"data: {json.dumps({'text': f'Error interno: {error_str}', 'is_done': True, 'error': True, 'conversation_id': conversation_id})}\n\n"

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(generate(), media_type="text/event-stream", headers=headers)


@router.get("/conversations/{project_id}")
async def get_conversations(project_id: str, session: AsyncSession = Depends(get_db_session)):
    """Fetch chat threads for a project."""
    import uuid
    try:
        project_uuid = uuid.UUID(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project_id")

    result = await session.execute(
        select(ConversationModel)
        .where(ConversationModel.project_id == project_uuid)
        .order_by(desc(ConversationModel.created_at))
    )
    conversations = result.scalars().all()
    return [{"id": c.id, "title": c.title or "Nuevo Chat", "created_at": c.created_at} for c in conversations]


@router.get("/conversations/messages/{conversation_id}")
async def get_conversation_messages(conversation_id: int, session: AsyncSession = Depends(get_db_session)):
    """Fetch messages for a given thread."""
    result = await session.execute(
        select(MessageModel)
        .where(MessageModel.conversation_id == conversation_id)
        .order_by(MessageModel.id)
    )
    messages = result.scalars().all()
    return [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at} for m in messages]


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: int, session: AsyncSession = Depends(get_db_session)):
    """Delete a conversation and all its messages."""
    conv = await session.get(ConversationModel, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await session.delete(conv)
    await session.commit()
    return {"status": "ok"}


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
    from app.infrastructure.config import DEFAULT_LLM_MODEL
    actual_model = DEFAULT_LLM_MODEL

    provider = actual_model.split("/")[0] if "/" in actual_model else actual_model
    api_key = CredentialManager.get_api_key(f"sprintlogic_{provider}") or CredentialManager.get_api_key(provider)
    if not api_key:
        api_key = CredentialManager.get_api_key("sprintlogic_openrouter")
        if not api_key:
            raise HTTPException(status_code=400, detail=f"{provider} API key not configured")

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
                model=actual_model,
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
