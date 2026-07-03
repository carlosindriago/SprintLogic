from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import json
import litellm
import httpx
import asyncio

from app.infrastructure.db.database import get_db_session
from app.application.ai_agent import AIAgent
from app.infrastructure.security.credential_manager import CredentialManager
from app.infrastructure.ai.context_builder import build_agent_context
from uuid import UUID

router = APIRouter()


SENSEI_SYSTEM_PROMPT = (
    "Eres un Arquitecto de Software Socrático (Modo Sensei). "
    "1. Analiza el archivo en el contexto de la arquitectura global. "
    "2. USA PRIMERO la información de documentación proporcionada para basar "
    "tus respuestas en la documentación oficial del Tech Stack. "
    "3. Guía al usuario explicando la lógica y el flujo de datos. "
    "4. TIENES ESTRICTAMENTE PROHIBIDO ESCRIBIR BLOQUES DE CÓDIGO LISTOS "
    "PARA COPIAR Y PEGAR. Usa solo pseudocódigo abstracto o snippets de 1 línea."
)


CONTEXT7_API = "https://api.context7.ai/v1"


async def _fetch_context7_docs(api_key: str, query: str, tech_stack: dict) -> str:
    """Query Context7 for relevant docs about the tech stack."""
    if not api_key:
        return ""

    # Extract library names from tech stack extensions
    libraries: list[str] = []
    ext_map = {
        ".ts": "typescript", ".tsx": "react", ".js": "javascript",
        ".py": "python", ".rs": "rust", ".go": "go",
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


class ChatRequest(BaseModel):
    messages: List[Dict[str, Any]]
    project_id: Optional[str] = None
    model: str = "gemini-1.5-pro-latest"


class ChatResponse(BaseModel):
    response: str


@router.post("/", response_model=ChatResponse)
async def chat_with_ai(request: ChatRequest, session: AsyncSession = Depends(get_db_session)):
    """Handles chat messages with the AI and manages tool calls."""
    try:
        agent = AIAgent(session=session, project_id=request.project_id)
        response_text = await agent.chat(request.messages, model=request.model)
        return {"response": response_text}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


class MentorRequest(BaseModel):
    file_path: str
    content: str
    project_tech_stack: Dict[str, Any] = {}
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
async def mentor_sensei(request: MentorRequest, background_tasks: BackgroundTasks, session: AsyncSession = Depends(get_db_session)):
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
        f"\n\nDocumentación oficial relevante (Context7):\n{context7_docs}"
        if context7_docs
        else ""
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
                    {"role": "system", "content": SENSEI_SYSTEM_PROMPT},
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
                if hasattr(chunk, 'usage') and chunk.usage:
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
