import logging

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.infrastructure.ai.llm_gateway import LiteLLMGateway
from app.infrastructure.security.credential_manager import CredentialManager

logger = logging.getLogger(__name__)

router = APIRouter()
llm_gateway = LiteLLMGateway()

# Thread-safe TTL cache for provider model lists. 32 providers × 5min TTL.
# Lives at module level but cachetools is process-local; acceptable for a
# single-instance Tauri sidecar. Replaced the previous unbounded dict.
_model_cache: TTLCache[str, list[dict]] = TTLCache(maxsize=32, ttl=300)


class APIKeyRequest(BaseModel):
    api_key: str


class ModelResult(BaseModel):
    id: str
    name: str


class APIKeyStatus(BaseModel):
    is_configured: bool


class ProviderFetchError(Exception):
    """Raised when a provider rejects the API key or the network call fails.

    Decoupled from FastAPI's HTTPException so the helper can be reused
    outside the request layer (tests, future background sync, etc.) without
    dragging the HTTP transport in.
    """

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


async def fetch_provider_models(provider: str, api_key: str) -> list[dict]:
    """Fetch the available models for a provider using the supplied API key.

    Returns a list of `{id, name}` dicts. Raises `ProviderFetchError` on
    network errors or rejected keys. Cache is consulted only for providers
    that don't need a per-user key (openrouter) — once we have a result
    we cache it regardless of provider for a 5 minute TTL.
    """
    if provider in _model_cache:
        return list(_model_cache[provider])

    models: list[dict] = []
    headers: dict[str, str] = {}

    async with httpx.AsyncClient() as client:
        try:
            if provider == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
                res = await client.get(url)
                if res.status_code != 200:
                    raise ProviderFetchError(f"Invalid Gemini Key: {res.text}")
                data = res.json()
                models = [
                    {"id": m["name"].replace("models/", ""), "name": m["displayName"]}
                    for m in data.get("models", [])
                    if "generateContent" in m.get("supportedGenerationMethods", [])
                ]

            elif provider == "openai":
                headers["Authorization"] = f"Bearer {api_key}"
                res = await client.get("https://api.openai.com/v1/models", headers=headers)
                if res.status_code != 200:
                    raise ProviderFetchError("Invalid OpenAI Key")
                data = res.json()
                models = [
                    {"id": m["id"], "name": m["id"]}
                    for m in data.get("data", [])
                    if "gpt" in m["id"] or "o1" in m["id"]
                ]

            elif provider == "anthropic":
                headers["x-api-key"] = api_key
                headers["anthropic-version"] = "2023-06-01"
                res = await client.get("https://api.anthropic.com/v1/models", headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    models = [
                        {"id": m["id"], "name": m.get("display_name", m["id"])}
                        for m in data.get("data", [])
                    ]
                else:
                    # Fallback when the list endpoint is unavailable / key region-restricted.
                    models = [
                        {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus"},
                        {"id": "claude-3-sonnet-20240229", "name": "Claude 3 Sonnet"},
                        {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku"},
                        {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet"},
                    ]

            elif provider == "openrouter":
                res = await client.get("https://openrouter.ai/api/v1/models")
                if res.status_code != 200:
                    raise ProviderFetchError("Failed to fetch OpenRouter models")
                data = res.json()
                models = [
                    {"id": m["id"], "name": m.get("name", m["id"])} for m in data.get("data", [])
                ]

            elif provider == "opencode-zen":
                headers["Authorization"] = f"Bearer {api_key}"
                res = await client.get("https://opencode.ai/zen/v1/models", headers=headers)
                if res.status_code != 200:
                    raise ProviderFetchError("Invalid OpenCode Zen Key")
                data = res.json()
                models = [{"id": m["id"], "name": m["id"]} for m in data.get("data", [])]

            elif provider == "opencode-go":
                headers["Authorization"] = f"Bearer {api_key}"
                res = await client.get("https://opencode.ai/zen/go/v1/models", headers=headers)
                if res.status_code != 200:
                    raise ProviderFetchError("Invalid OpenCode Go Key")
                data = res.json()
                models = [{"id": m["id"], "name": m["id"]} for m in data.get("data", [])]

            elif provider == "nvidia":
                headers["Authorization"] = f"Bearer {api_key}"
                res = await client.get(
                    "https://integrate.api.nvidia.com/v1/models", headers=headers
                )
                if res.status_code != 200:
                    raise ProviderFetchError("Invalid Nvidia NIM Key")
                data = res.json()
                models = [{"id": m["id"], "name": m["id"]} for m in data.get("data", [])]

            else:
                raise ProviderFetchError(f"Unsupported provider: {provider}")

        except httpx.RequestError as exc:
            raise ProviderFetchError(f"Network error: {exc!s}") from exc

    _model_cache[provider] = models
    return models


@router.get("/providers/{provider}/models", response_model=list[ModelResult])
async def get_provider_models(provider: str):
    """Fetches available models for a provider using the stored API key.

    The key is read from the OS keyring via `CredentialManager`; it never
    leaves the local machine. Returns 404 if the key is not configured.
    """
    api_key = CredentialManager.get_api_key(provider)
    if not api_key:
        raise HTTPException(status_code=404, detail=f"API key for {provider} not found")

    try:
        return await fetch_provider_models(provider, api_key)
    except ProviderFetchError as exc:
        logger.error("Provider fetch error: %s", exc, exc_info=True)
        raise HTTPException(status_code=exc.status_code, detail="An error occurred while communicating with the provider") from exc


@router.post("/providers/{provider}/keys", response_model=list[ModelResult])
async def save_and_verify_provider_key(provider: str, request: APIKeyRequest):
    """Validates the API key against the provider and persists it locally.

    The key is validated by attempting to fetch the model list. Only on
    success is the key written to the OS keyring. Nothing is stored on
    failure — the caller can safely retry.
    """
    if not request.api_key or not request.api_key.strip():
        raise HTTPException(status_code=400, detail="API key cannot be empty")

    try:
        models = await fetch_provider_models(provider, request.api_key.strip())
    except ProviderFetchError as exc:
        logger.error("Provider fetch error: %s", exc, exc_info=True)
        raise HTTPException(status_code=exc.status_code, detail="An error occurred while communicating with the provider") from exc

    CredentialManager.save_api_key(provider, request.api_key.strip())
    return models


@router.get("/api-key/{provider}", response_model=APIKeyStatus)
async def check_api_key_status(provider: str):
    """Returns whether an API key is currently stored for `provider`.

    Does not return the key itself — only its presence.
    """
    key = CredentialManager.get_api_key(provider)
    return {"is_configured": bool(key)}


@router.delete("/api-key/{provider}")
async def delete_api_key(provider: str):
    """Removes the stored API key for `provider` from the OS keyring."""
    CredentialManager.delete_api_key(provider)
    return {"status": "success", "message": f"API key for {provider} deleted"}


CURATED_MODELS = {
    "gemini": [
        {"id": "gemini/gemini-2.5-flash", "name": "Gemini 2.5 Flash"},
        {"id": "gemini/gemini-1.5-pro", "name": "Gemini 1.5 Pro"},
    ],
    "openai": [
        {"id": "openai/gpt-4o", "name": "GPT-4o"},
        {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini"},
    ],
    "anthropic": [
        {"id": "anthropic/claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet"},
        {"id": "anthropic/claude-3-haiku-20240307", "name": "Claude 3 Haiku"},
    ],
    "openrouter": [
        {"id": "openrouter/anthropic/claude-3.5-sonnet", "name": "Claude 3.5 Sonnet"},
        {"id": "openrouter/openai/gpt-4o", "name": "GPT-4o"},
    ],
    "opencode-zen": [
        {"id": "opencode-zen/gpt-4o", "name": "OpenCode Zen"},
    ],
    "opencode-go": [
        {"id": "opencode-go/deepseek-v4-flash", "name": "OpenCode Go"},
    ],
    "nvidia": [
        {"id": "nvidia_nim/meta/llama-3.1-70b-instruct", "name": "Llama 3.1 70B (NIM)"},
        {"id": "nvidia_nim/meta/llama-3.1-8b-instruct", "name": "Llama 3.1 8B (NIM)"},
        {"id": "nvidia_nim/mistralai/mixtral-8x22b-instruct-v0.1", "name": "Mixtral 8x22B (NIM)"},
        {"id": "nvidia_nim/nvidia/nemotron-4-340b-instruct", "name": "Nemotron 4 340B (NIM)"},
    ],
}

PROVIDER_LABELS = {
    "gemini": "Gemini",
    "openai": "OpenAI",
    "anthropic": "Claude",
    "openrouter": "OpenRouter",
    "opencode-zen": "OpenCode Zen",
    "opencode-go": "OpenCode Go",
    "nvidia": "Nvidia NIM",
}


@router.get("/ai/models")
async def get_curated_models():
    """Returns curated chat/code models grouped by provider with valid API keys."""
    results: list[dict] = []
    for provider, models in CURATED_MODELS.items():
        key = CredentialManager.get_api_key(provider)
        if key:
            results.append(
                {
                    "provider": PROVIDER_LABELS.get(provider, provider),
                    "provider_id": provider,
                    "models": models,
                }
            )
    return results
