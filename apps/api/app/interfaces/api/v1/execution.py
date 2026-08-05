import logging
from collections.abc import AsyncGenerator
from typing import Any

import litellm
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db_session
from app.infrastructure.repositories.prompt_repository import (
    EXEC_MODE_PAIR_PROGRAMMING_CONTENT,
    EXEC_MODE_PAIR_PROGRAMMING_ID,
    EXEC_MODE_SURGEON_CONTENT,
    EXEC_MODE_SURGEON_ID,
    EXEC_MODE_WHITEBOARD_CONTENT,
    EXEC_MODE_WHITEBOARD_ID,
    get_prompt_async,
)
from app.infrastructure.repositories.tool_model_repository import (
    resolve_tool_model,
    tool_model_label,
)
from app.infrastructure.security.credential_manager import CredentialManager
from app.infrastructure.security.rate_limiter import require_rate_limit

router = APIRouter()


class ExecuteAgentRequest(BaseModel):
    ticket_id: str | None = None
    prompt: str
    history: list[dict[str, Any]] = []
    execution_mode: str = EXEC_MODE_SURGEON_ID


@router.post("/projects/{project_id}/execute_agent")
async def execute_agent(
    project_id: str,
    request: ExecuteAgentRequest,
    session: AsyncSession = Depends(get_db_session),
    _rate_limit: None = Depends(require_rate_limit(limit=20, window_seconds=60, scope="execution")),
):
    """Execution Room endpoint that streams responses tailored by execution_mode."""
    mode_id = request.execution_mode
    prompt_model = await get_prompt_async(session, mode_id)

    if prompt_model:
        system_content = prompt_model.content
    else:
        # Fallback mappings if prompt not yet in DB
        fallback_map = {
            EXEC_MODE_SURGEON_ID: EXEC_MODE_SURGEON_CONTENT,
            EXEC_MODE_PAIR_PROGRAMMING_ID: EXEC_MODE_PAIR_PROGRAMMING_CONTENT,
            EXEC_MODE_WHITEBOARD_ID: EXEC_MODE_WHITEBOARD_CONTENT,
        }
        system_content = fallback_map.get(mode_id, EXEC_MODE_SURGEON_CONTENT)

    # Resolve active LLM provider and model
    provider, model_name, _ = await resolve_tool_model(session, "chat")
    actual_model = tool_model_label(provider, model_name)

    api_key = CredentialManager.get_api_key(f"sprintlogic_{provider}") or CredentialManager.get_api_key(provider)
    if not api_key:
        api_key = CredentialManager.get_api_key("sprintlogic_openrouter")
        if not api_key:
            raise HTTPException(status_code=400, detail=f"API Key for {provider} not configured")

    messages_to_send: list[dict[str, Any]] = [{"role": "system", "content": system_content}]

    # Append valid history turns
    for msg in request.history:
        if isinstance(msg, dict) and "role" in msg and "content" in msg:
            messages_to_send.append({"role": msg["role"], "content": msg["content"]})

    # Append latest user prompt if not redundant with last history turn
    if not messages_to_send or messages_to_send[-1].get("content") != request.prompt:
        messages_to_send.append({"role": "user", "content": request.prompt})

    async def generate() -> AsyncGenerator[str, None]:
        try:
            response = await litellm.acompletion(
                model=actual_model,
                messages=messages_to_send,
                api_key=api_key,
                stream=True,
            )
            async for chunk in response:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content
        except Exception as e:
            logging.error("Execution room streaming failed: %s", e, exc_info=True)
            yield f"\n[Error en ejecución de IA: {str(e)}]"

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(generate(), media_type="text/plain", headers=headers)
