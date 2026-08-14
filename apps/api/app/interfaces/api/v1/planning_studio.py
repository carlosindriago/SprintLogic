import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import litellm
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.infrastructure.repositories.tool_model_repository import (
    resolve_tool_model,
    tool_model_label,
)
from app.infrastructure.security.credential_manager import CredentialManager
from app.interfaces.api.v1.wbs_schemas import WBSHierarchicalResponse

router = APIRouter()


class PlanningMessage(BaseModel):
    role: str
    content: str


class PlanningRequest(BaseModel):
    messages: list[PlanningMessage]
    project_id: str
    model: str | None = None


@router.post("/message")
async def process_planning_message(req: Request, request: PlanningRequest):
    # BD es la única fuente de verdad: resolve planning_studio tool override
    # (o el global default) desde tool_model_mappings. El request.body ya NO
    # dicta el modelo.
    from app.infrastructure.db.database import get_sessionmaker

    async with get_sessionmaker()() as session:
        ps_provider, ps_model, fallbacks = await resolve_tool_model(session, "planning_studio")
        model = tool_model_label(ps_provider, ps_model)

    from app.infrastructure.ai.provider_adapter import ProviderAdapter

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
                "description": "Render a Work Breakdown Structure (WBS) tree to the UI when the user asks to generate, show, or plan tasks/epics.",
                "parameters": WBSHierarchicalResponse.model_json_schema(),
            },
        }
    ]

    from app.infrastructure.ai.prompt_renderer import render_prompt
    from app.infrastructure.db.database import get_sessionmaker
    from app.infrastructure.repositories.prompt_repository import get_prompt_async

    async with get_sessionmaker()() as session:
        prompt_model = await get_prompt_async(session, "planning_studio_assistant")
        if prompt_model:
            system_msg = render_prompt(prompt_model.content)
        else:
            system_msg = "You are an AI planning assistant. If the user asks for a project plan, tasks, or WBS, use the 'render_wbs_tree' tool to show the plan."

    messages_to_send = [{"role": "system", "content": system_msg}]
    for msg in request.messages:
        messages_to_send.append({"role": msg.role, "content": msg.content})

    from app.infrastructure.ai.provider_adapter import ProviderAdapter
    from app.infrastructure.config import DEFAULT_LLM_MODEL

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

    async def generate() -> AsyncGenerator[str, None]:
        last_error = None
        for i, candidate in enumerate(candidates):
            has_yielded = False
            try:
                if i > 0:
                    logging.info(
                        "Planning streaming: falling back to candidate %d (%s)",
                        i,
                        candidate["model"],
                    )

                response = await litellm.acompletion(
                    model=candidate["model"],
                    messages=messages_to_send,
                    tools=tools,
                    api_key=candidate["api_key"],
                    stream=True,
                    num_retries=1,
                    timeout=30,
                    **candidate.get("kwargs", {}),
                )

                tool_calls_buffer: dict[int, Any] = {}

                async for chunk in response:
                    delta = chunk.choices[0].delta if chunk and chunk.choices else None

                    # Yield text content
                    if delta and delta.content:
                        has_yielded = True
                        yield f"data: {json.dumps({'text': delta.content, 'is_done': False})}\n\n"

                    # Buffer tool calls
                    if delta and getattr(delta, "tool_calls", None):
                        has_yielded = True
                        for tc in delta.tool_calls:
                            idx = tc.index
                            if idx not in tool_calls_buffer:
                                tool_calls_buffer[idx] = {
                                    "id": tc.id or f"call_{idx}",
                                    "type": "function",
                                    "function": {
                                        "name": tc.function.name if tc.function.name else "",
                                        "arguments": tc.function.arguments
                                        if tc.function.arguments
                                        else "",
                                    },
                                }
                            else:
                                if tc.function.name:
                                    tool_calls_buffer[idx]["function"]["name"] += tc.function.name
                                if tc.function.arguments:
                                    tool_calls_buffer[idx]["function"]["arguments"] += (
                                        tc.function.arguments
                                    )

                # Yield accumulated tool calls at the end
                if tool_calls_buffer:
                    calls_list = list(tool_calls_buffer.values())
                    yield f"data: {json.dumps({'tool_calls': calls_list, 'is_done': False})}\n\n"

                yield f"data: {json.dumps({'is_done': True})}\n\n"
                return

            except Exception as e:
                last_error = e
                logging.warning(
                    "Planning streaming candidate %d (%s) failed: %s",
                    i,
                    candidate["model"],
                    e,
                )
                if not has_yielded and i < len(candidates) - 1:
                    continue
                yield f"data: {json.dumps({'error': str(e), 'is_done': True})}\n\n"
                return

        if last_error:
            yield f"data: {json.dumps({'error': str(last_error), 'is_done': True})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


