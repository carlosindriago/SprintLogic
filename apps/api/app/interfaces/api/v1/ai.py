import json
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import litellm

from app.infrastructure.ai.context7_client import Context7Client
from app.infrastructure.ai.provider_adapter import ProviderAdapter
from app.infrastructure.security.credential_manager import CredentialManager
from app.interfaces.api.v1.settings import CURATED_MODELS, PROVIDER_LABELS

router = APIRouter()

_logger = logging.getLogger("sprintlogic.fim")

FIM_MODEL = "gemini/gemini-2.5-flash"


class APIKeysPayload(BaseModel):
    gemini_key: str | None = None
    openai_key: str | None = None
    anthropic_key: str | None = None
    openrouter_key: str | None = None
    opencode_zen_key: str | None = None
    opencode_go_key: str | None = None
    nvidia_key: str | None = None


class FimRequest(BaseModel):
    prefix: str
    suffix: str
    language: str = ""


class FimResponse(BaseModel):
    code: str = ""
    explanation: str = ""


@router.get("/models")
async def get_ai_models():
    """Returns the curated model catalog grouped by provider.

    Each provider includes an is_configured flag indicating whether an
    API key has been stored for it. No external APIs are queried.
    """
    results: list[dict] = []
    for provider, models in CURATED_MODELS.items():
        key = CredentialManager.get_api_key(provider)
        results.append(
            {
                "provider": PROVIDER_LABELS.get(provider, provider),
                "provider_id": provider,
                "is_configured": key is not None and key != "",
                "models": models,
            }
        )
    return results


@router.post("/active-models")
async def get_active_models(payload: APIKeysPayload):
    """Returns curated chat/code models grouped by provider with valid API keys."""
    results: list[dict] = []

    key_mapping = {
        "gemini": payload.gemini_key,
        "openai": payload.openai_key,
        "anthropic": payload.anthropic_key,
        "openrouter": payload.openrouter_key,
        "opencode-zen": payload.opencode_zen_key,
        "opencode-go": payload.opencode_go_key,
        "nvidia": payload.nvidia_key,
    }

    for provider, models in CURATED_MODELS.items():
        key = key_mapping.get(provider)
        if key:
            results.append(
                {
                    "provider": provider.upper(),
                    "models": models,
                }
            )
    return results


@router.post("/fim-completion", response_model=FimResponse)
async def fim_completion(request: FimRequest):
    """Fill-In-the-Middle completion with cached Context7 documentation.

    Returns a JSON object with the suggested code and a 1-line explanation.
    """
    provider = ProviderAdapter.get_provider(FIM_MODEL)
    api_key = CredentialManager.get_api_key(provider)
    if not api_key:
        raise HTTPException(status_code=400, detail="FIM model API key not configured")

    cached_context = ""
    context7_api_key = CredentialManager.get_api_key("context7")
    if context7_api_key and request.language:
        cached_context = await Context7Client.search(request.language, context7_api_key)

    system = (
        "You are a code completion assistant. Given a code prefix and suffix, "
        "complete the missing code in the middle. Return ONLY valid JSON with "
        'exactly two keys: "code" (the completed code that fits between prefix '
        'and suffix) and "explanation" (a single short line explaining the completion). '
        "Do NOT include backticks, markdown, or extra text.\n\n"
    )
    if cached_context:
        system += f"Relevant documentation:\n{cached_context}\n\n"

    user = (
        f"Complete the code between PREFIX and SUFFIX for {request.language or 'code'}:\n"
        f"PREFIX:\n{request.prefix[-2000:]}\n\n"
        f"SUFFIX:\n{request.suffix[:500]}\n\n"
        f'Return JSON: {{"code": "...", "explanation": "short explanation"}}'
    )

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    adapted = ProviderAdapter.adapt(FIM_MODEL, api_key)

    try:
        response = await litellm.acompletion(
            model=adapted["model"],
            messages=messages,
            api_key=adapted["api_key"],
            max_tokens=256,
            temperature=0.2,
            **adapted["kwargs"],
        )
    except Exception as e:
        _logger.warning("FIM completion failed: %s", e)
        return FimResponse()

    raw = str(response.choices[0].message.content or "").strip()
    raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        parsed = json.loads(raw)
        return FimResponse(
            code=str(parsed.get("code", "")),
            explanation=str(parsed.get("explanation", "")),
        )
    except (json.JSONDecodeError, TypeError):
        return FimResponse(code=raw[:200])
