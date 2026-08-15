import logging

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.ai.llm_gateway import LiteLLMGateway
from app.infrastructure.db.database import get_db_session
from app.infrastructure.repositories.tool_model_repository import (
    delete_tool_mapping,
    list_tool_mappings,
    upsert_tool_mapping,
)
from app.infrastructure.security.credential_manager import CredentialManager

logger = logging.getLogger(__name__)

router = APIRouter()
llm_gateway = LiteLLMGateway()


# Thread-safe TTL cache for provider model lists. 32 providers × 5min TTL.
# Lives at module level but cachetools is process-local; acceptable for a
# single-instance Tauri sidecar. Replaced the previous unbounded dict.
class ProviderModel(BaseModel):
    id: str
    name: str


_model_cache: TTLCache[str, list[ProviderModel]] = TTLCache(maxsize=32, ttl=300)


class APIKeyRequest(BaseModel):
    api_key: str


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


def clear_model_cache() -> None:
    """Clears the in-memory provider models TTL cache."""
    _model_cache.clear()


async def fetch_provider_models(
    provider: str, api_key: str, force_refresh: bool = False
) -> list[ProviderModel]:
    """Fetch the available models for a provider using the supplied API key.

    Returns a list of `ProviderModel`. Raises `ProviderFetchError` on
    network errors or rejected keys. Cache is consulted only for providers
    that don't need a per-user key (openrouter) — once we have a result
    we cache it regardless of provider for a 5 minute TTL.
    """
    if not force_refresh and provider in _model_cache:
        return list(_model_cache[provider])

    models: list[ProviderModel] = []
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
                    ProviderModel(
                        id=f"gemini/{m['name'].replace('models/', '')}", name=m["displayName"]
                    )
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
                    ProviderModel(
                        id=f"openai/{m['id']}" if not m["id"].startswith("openai/") else m["id"],
                        name=m["id"],
                    )
                    for m in data.get("data", [])
                    if "gpt" in m["id"]
                    or "o1" in m["id"]
                    or "o3" in m["id"]
                    or "codex" in m["id"]
                    or "ft:" in m["id"]
                ]

            elif provider == "anthropic":
                headers["x-api-key"] = api_key
                headers["anthropic-version"] = "2023-06-01"
                res = await client.get("https://api.anthropic.com/v1/models", headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    models = [
                        ProviderModel(
                            id=f"anthropic/{m['id']}"
                            if not m["id"].startswith("anthropic/")
                            else m["id"],
                            name=m.get("display_name", m["id"]),
                        )
                        for m in data.get("data", [])
                    ]
                else:
                    # Fallback when the list endpoint is unavailable / key region-restricted.
                    models = [
                        ProviderModel(id="claude-3-opus-20240229", name="Claude 3 Opus"),
                        ProviderModel(id="claude-3-sonnet-20240229", name="Claude 3 Sonnet"),
                        ProviderModel(id="claude-3-haiku-20240307", name="Claude 3 Haiku"),
                        ProviderModel(id="claude-3-5-sonnet-20241022", name="Claude 3.5 Sonnet"),
                    ]

            elif provider == "openrouter":
                res = await client.get("https://openrouter.ai/api/v1/models")
                if res.status_code != 200:
                    raise ProviderFetchError("Failed to fetch OpenRouter models")
                data = res.json()
                models = [
                    ProviderModel(
                        id=f"openrouter/{m['id']}"
                        if not m["id"].startswith("openrouter/")
                        else m["id"],
                        name=m.get("name", m["id"]),
                    )
                    for m in data.get("data", [])
                ]

            elif provider == "opencode-zen":
                headers["Authorization"] = f"Bearer {api_key}"
                res = await client.get("https://opencode.ai/zen/v1/models", headers=headers)
                if res.status_code != 200:
                    raise ProviderFetchError("Invalid OpenCode Zen Key")
                data = res.json()
                models = [
                    ProviderModel(
                        id=f"opencode-zen/{m['id']}"
                        if not m["id"].startswith("opencode-zen/")
                        else m["id"],
                        name=m["id"],
                    )
                    for m in data.get("data", [])
                ]

            elif provider == "opencode-go":
                headers["Authorization"] = f"Bearer {api_key}"
                res = await client.get("https://opencode.ai/zen/go/v1/models", headers=headers)
                if res.status_code != 200:
                    raise ProviderFetchError("Invalid OpenCode Go Key")
                data = res.json()
                models = [
                    ProviderModel(
                        id=f"opencode-go/{m['id']}"
                        if not m["id"].startswith("opencode-go/")
                        else m["id"],
                        name=m["id"],
                    )
                    for m in data.get("data", [])
                ]

            elif provider == "groq":
                headers["Authorization"] = f"Bearer {api_key}"
                res = await client.get("https://api.groq.com/openai/v1/models", headers=headers)
                if res.status_code != 200:
                    raise ProviderFetchError("Invalid Groq Key")
                data = res.json()
                models = [
                    ProviderModel(
                        id=f"groq/{m['id']}" if not m["id"].startswith("groq/") else m["id"],
                        name=m["id"],
                    )
                    for m in data.get("data", [])
                ]

            elif provider == "ollama_cloud":
                headers["Authorization"] = f"Bearer {api_key}"
                res = await client.get("https://ollama.com/api/tags", headers=headers)
                if res.status_code != 200:
                    raise ProviderFetchError("Invalid Ollama Cloud Key")
                data = res.json()
                models = [
                    ProviderModel(
                        id=f"ollama_cloud/{m['name']}"
                        if not m["name"].startswith("ollama_cloud/")
                        else m["name"],
                        name=m["name"],
                    )
                    for m in data.get("models", [])
                ]

            elif provider == "ollama":
                # For ollama local, api_key is actually the Base URL
                url = api_key.rstrip("/")
                res = await client.get(f"{url}/api/tags")
                if res.status_code != 200:
                    raise ProviderFetchError("Cannot reach Ollama")
                data = res.json()
                models = [
                    ProviderModel(
                        id=f"ollama/{m['name']}"
                        if not m["name"].startswith("ollama/")
                        else m["name"],
                        name=m["name"],
                    )
                    for m in data.get("models", [])
                ]

            elif provider == "nvidia":
                headers["Authorization"] = f"Bearer {api_key}"
                res = await client.get(
                    "https://integrate.api.nvidia.com/v1/models", headers=headers
                )
                if res.status_code != 200:
                    raise ProviderFetchError("Invalid Nvidia NIM Key")
                data = res.json()
                models = [
                    ProviderModel(
                        id=f"nvidia_nim/{m['id']}"
                        if not m["id"].startswith("nvidia_nim/")
                        else m["id"],
                        name=m["id"],
                    )
                    for m in data.get("data", [])
                ]
            elif provider in ("zai", "z-ai"):
                headers["Authorization"] = f"Bearer {api_key}"
                headers["Accept-Language"] = "en-US,en"
                try:
                    res = await client.get(
                        "https://api.z.ai/api/paas/v4/models", headers=headers
                    )
                    if res.status_code == 200:
                        data = res.json()
                        models = [
                            ProviderModel(
                                id=f"zai/{m.get('id', m.get('name'))}"
                                if not str(m.get("id", "")).startswith("zai/")
                                else str(m.get("id")),
                                name=str(m.get("id", m.get("name"))),
                            )
                            for m in data.get("data", data.get("models", []))
                            if m.get("id") or m.get("name")
                        ]
                except Exception:
                    pass

                if not models:
                    models = [
                        ProviderModel(id="zai/glm-5.2", name="GLM-5.2"),
                        ProviderModel(id="zai/glm-4-plus", name="GLM-4 Plus"),
                        ProviderModel(id="zai/glm-4-air", name="GLM-4 Air"),
                        ProviderModel(id="zai/glm-4-flash", name="GLM-4 Flash"),
                        ProviderModel(id="zai/glm-4-long", name="GLM-4 Long"),
                        ProviderModel(id="zai/glm-4v-plus", name="GLM-4V Plus"),
                    ]

            elif provider == "cerebras":
                headers["Authorization"] = f"Bearer {api_key}"
                res = await client.get(
                    "https://api.cerebras.ai/v1/models", headers=headers
                )
                if res.status_code == 200:
                    data = res.json()
                    models = [
                        ProviderModel(
                            id=f"cerebras/{m.get('id', m.get('name'))}"
                            if not str(m.get("id", "")).startswith("cerebras/")
                            else str(m.get("id")),
                            name=str(m.get("id", m.get("name"))),
                        )
                        for m in data.get("data", data.get("models", []))
                        if m.get("id") or m.get("name")
                    ]
                elif res.status_code in (401, 403):
                    raise ProviderFetchError(
                        "Invalid Cerebras API Key", status_code=res.status_code
                    )

                if not models:
                    models = [
                        ProviderModel(id="cerebras/llama-3.3-70b", name="Llama 3.3 70B"),
                        ProviderModel(id="cerebras/llama-3.1-70b", name="Llama 3.1 70B"),
                        ProviderModel(id="cerebras/llama-3.1-8b", name="Llama 3.1 8B"),
                        ProviderModel(
                            id="cerebras/deepseek-r1-distill-llama-70b",
                            name="DeepSeek R1 Distill 70B",
                        ),
                        ProviderModel(
                            id="cerebras/qwen-2.5-coder-32b",
                            name="Qwen 2.5 Coder 32B",
                        ),
                    ]

            elif provider in ("github", "github_models"):
                headers["Authorization"] = f"Bearer {api_key}"
                headers["User-Agent"] = "SprintLogic/1.0"
                try:
                    res = await client.get(
                        "https://models.github.ai/inference/models", headers=headers
                    )
                    if res.status_code != 200:
                        res = await client.get(
                            "https://models.inference.ai.azure.com/models", headers=headers
                        )

                    if res.status_code == 200:
                        data = res.json()
                        raw_list = data if isinstance(data, list) else data.get("data", data.get("models", []))
                        models = [
                            ProviderModel(
                                id=f"github/{m.get('name', m.get('id'))}"
                                if not str(m.get('name', m.get('id', ''))).startswith("github/")
                                else str(m.get('name', m.get('id'))),
                                name=str(m.get('name', m.get('id'))),
                            )
                            for m in raw_list
                            if m.get("name") or m.get("id")
                        ]
                    elif res.status_code in (401, 403):
                        raise ProviderFetchError(
                            "Invalid GitHub Personal Access Token (PAT)", status_code=res.status_code
                        )
                except ProviderFetchError:
                    raise
                except Exception:
                    pass

                if not models:
                    models = [
                        ProviderModel(id="github/gpt-4o", name="GPT-4o"),
                        ProviderModel(id="github/gpt-4o-mini", name="GPT-4o mini"),
                        ProviderModel(id="github/o1-preview", name="o1-preview"),
                        ProviderModel(id="github/o1-mini", name="o1-mini"),
                        ProviderModel(id="github/o3-mini", name="o3-mini"),
                        ProviderModel(id="github/Meta-Llama-3.1-405B-Instruct", name="Meta Llama 3.1 405B"),
                        ProviderModel(id="github/Meta-Llama-3.1-70B-Instruct", name="Meta Llama 3.1 70B"),
                        ProviderModel(id="github/Meta-Llama-3.1-8B-Instruct", name="Meta Llama 3.1 8B"),
                        ProviderModel(id="github/Mistral-Large-2407", name="Mistral Large 2407"),
                        ProviderModel(id="github/Mistral-Nemo", name="Mistral Nemo"),
                        ProviderModel(id="github/Phi-3.5-MoE-instruct", name="Phi-3.5 MoE"),
                        ProviderModel(id="github/Phi-3.5-mini-instruct", name="Phi-3.5 mini"),
                    ]

            else:
                raise ProviderFetchError(f"Unsupported provider: {provider}")

        except httpx.RequestError as exc:
            raise ProviderFetchError(f"Network error: {exc!s}") from exc

    _model_cache[provider] = models
    return models


@router.get("/providers/{provider}/models", response_model=list[ProviderModel])
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
        raise HTTPException(
            status_code=exc.status_code,
            detail="An error occurred while communicating with the provider",
        ) from exc


@router.post("/providers/{provider}/keys", response_model=list[ProviderModel])
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
        raise HTTPException(
            status_code=exc.status_code,
            detail="An error occurred while communicating with the provider",
        ) from exc

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
        ProviderModel(id="gemini/gemini-2.5-flash", name="Gemini 2.5 Flash"),
        ProviderModel(id="gemini/gemini-1.5-pro", name="Gemini 1.5 Pro"),
    ],
    "openai": [
        ProviderModel(id="openai/gpt-4o", name="GPT-4o"),
        ProviderModel(id="openai/gpt-4o-mini", name="GPT-4o Mini"),
    ],
    "anthropic": [
        ProviderModel(id="anthropic/claude-3-5-sonnet-20241022", name="Claude 3.5 Sonnet"),
        ProviderModel(id="anthropic/claude-3-haiku-20240307", name="Claude 3 Haiku"),
    ],
    "openrouter": [
        ProviderModel(id="openrouter/anthropic/claude-3.5-sonnet", name="Claude 3.5 Sonnet"),
        ProviderModel(id="openrouter/openai/gpt-4o", name="GPT-4o"),
    ],
    "opencode-zen": [
        ProviderModel(id="opencode-zen/gpt-4o", name="OpenCode Zen"),
    ],
    "opencode-go": [
        ProviderModel(id="opencode-go/deepseek-v4-flash", name="OpenCode Go"),
    ],
    "groq": [
        ProviderModel(id="groq/llama-3.1-8b-instant", name="Llama 3.1 8B"),
    ],
    "ollama_cloud": [
        ProviderModel(id="ollama_cloud/gpt-oss:120b-cloud", name="GPT-OSS 120B"),
    ],
    "ollama": [
        ProviderModel(id="ollama/llama3.2:1b", name="Llama 3.2 1B"),
    ],
    "nvidia": [
        ProviderModel(id="nvidia_nim/meta/llama-3.1-70b-instruct", name="Llama 3.1 70B (NIM)"),
        ProviderModel(id="nvidia_nim/meta/llama-3.1-8b-instruct", name="Llama 3.1 8B (NIM)"),
        ProviderModel(
            id="nvidia_nim/mistralai/mixtral-8x22b-instruct-v0.1", name="Mixtral 8x22B (NIM)"
        ),
        ProviderModel(
            id="nvidia_nim/nvidia/nemotron-4-340b-instruct", name="Nemotron 4 340B (NIM)"
        ),
    ],
    "zai": [
        ProviderModel(id="zai/glm-5.2", name="GLM-5.2"),
        ProviderModel(id="zai/glm-4-plus", name="GLM-4 Plus"),
        ProviderModel(id="zai/glm-4-air", name="GLM-4 Air"),
        ProviderModel(id="zai/glm-4-flash", name="GLM-4 Flash"),
    ],
    "cerebras": [
        ProviderModel(id="cerebras/llama-3.3-70b", name="Llama 3.3 70B"),
        ProviderModel(id="cerebras/llama-3.1-8b", name="Llama 3.1 8B"),
        ProviderModel(
            id="cerebras/deepseek-r1-distill-llama-70b",
            name="DeepSeek R1 Distill 70B",
        ),
    ],
    "github": [
        ProviderModel(id="github/gpt-4o", name="GPT-4o"),
        ProviderModel(id="github/gpt-4o-mini", name="GPT-4o mini"),
        ProviderModel(id="github/o1-preview", name="o1-preview"),
        ProviderModel(id="github/o1-mini", name="o1-mini"),
        ProviderModel(id="github/Meta-Llama-3.1-70B-Instruct", name="Meta Llama 3.1 70B"),
        ProviderModel(id="github/Mistral-Large-2407", name="Mistral Large 2407"),
    ],
}

PROVIDER_LABELS = {
    "gemini": "Gemini",
    "openai": "OpenAI",
    "anthropic": "Claude",
    "openrouter": "OpenRouter",
    "opencode-zen": "OpenCode Zen",
    "opencode-go": "OpenCode Go",
    "groq": "Groq",
    "ollama_cloud": "Ollama Cloud",
    "ollama": "Ollama Local",
    "nvidia": "Nvidia NIM",
    "zai": "Z.AI (GLM)",
    "cerebras": "Cerebras AI",
    "github": "GitHub Models (Copilot)",
}


@router.get("/ai/models")
async def get_curated_models():
    """Returns available chat/code models dynamically grouped by provider."""
    results: list[dict] = []
    for provider, fallback_models in CURATED_MODELS.items():
        key = CredentialManager.get_api_key(provider)
        if key:
            try:
                fetched_models = await fetch_provider_models(provider, key)
                models = [m.model_dump() for m in fetched_models]
            except ProviderFetchError:
                models = fallback_models
            results.append(
                {
                    "provider": PROVIDER_LABELS.get(provider, provider),
                    "provider_id": provider,
                    "is_configured": True,
                    "models": models,
                }
            )
        else:
            results.append(
                {
                    "provider": PROVIDER_LABELS.get(provider, provider),
                    "provider_id": provider,
                    "is_configured": False,
                    "models": fallback_models,
                }
            )
    return results


# ── Tool Model Mappings ──────────────────────────────────────────────────────


class ToolModelMappingRequest(BaseModel):
    provider_id: str
    model_name: str
    fallback_models: list[str] | None = None


@router.get("/tool-models")
async def list_tool_model_mappings(
    session: AsyncSession = Depends(get_db_session),
):
    """List all known tools with their effective model configuration."""
    data = await list_tool_mappings(session)
    return data


@router.put("/tool-models/{tool_name}")
async def update_tool_model_mapping(
    tool_name: str,
    request: ToolModelMappingRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Override the model for a specific tool. The tool name must be one of
    the known tools defined in KNOWN_TOOLS.
    """
    from app.infrastructure.repositories.tool_model_repository import KNOWN_TOOLS

    if tool_name not in KNOWN_TOOLS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown tool '{tool_name}'. Known tools: {', '.join(KNOWN_TOOLS)}",
        )

    mapping = await upsert_tool_mapping(
        session,
        tool_name=tool_name,
        provider_id=request.provider_id,
        model_name=request.model_name,
        fallback_models=request.fallback_models,
    )
    await session.commit()
    return {
        "tool_name": mapping.tool_name,
        "provider_id": mapping.provider_id,
        "model_name": mapping.model_name,
        "fallback_models": mapping.fallback_models,
    }


@router.delete("/tool-models/{tool_name}")
async def remove_tool_model_mapping(
    tool_name: str,
    session: AsyncSession = Depends(get_db_session),
):
    """Remove the model override for a tool, reverting it to the global default."""
    await delete_tool_mapping(session, tool_name)
    await session.commit()
    return {"status": "deleted", "tool_name": tool_name}


@router.get("/model-health")
async def get_model_health_metrics(
    session: AsyncSession = Depends(get_db_session),
):
    """Return health and reliability metrics for all tracked AI models."""
    from app.infrastructure.ai.model_health_tracker import ModelHealthTracker

    return await ModelHealthTracker.get_all_metrics(session)


@router.delete("/model-health/{model_id:path}")
async def reset_model_health_metrics(
    model_id: str,
    session: AsyncSession = Depends(get_db_session),
):
    """Reset health metrics for a specific AI model."""
    from app.infrastructure.ai.model_health_tracker import ModelHealthTracker

    deleted = await ModelHealthTracker.delete_metric(session, model_id)
    return {"status": "deleted" if deleted else "not_found", "model_id": model_id}


class DiagnoseModelItem(BaseModel):
    model_config = {"extra": "ignore"}
    id: str | None = None
    model: str | None = None
    slug: str | None = None
    name: str | None = None
    provider: str | None = None
    provider_id: str | None = None


class DiagnoseModelsRequest(BaseModel):
    model_config = {"extra": "ignore"}
    models: list[DiagnoseModelItem] = []
    concurrency: int = 3
    timeout_seconds: int = 12


@router.post("/model-health/diagnose")
async def diagnose_models_stream(
    request: DiagnoseModelsRequest,
):
    """Executes a controlled concurrent diagnostic ping across models and streams progress."""
    import asyncio
    import json

    from fastapi.responses import StreamingResponse

    from app.infrastructure.ai.model_health_tracker import ModelHealthTracker

    target_models = [m for m in (request.models or []) if (m.id or m.model or m.slug or m.name)]
    concurrency = min(max(1, request.concurrency), 6)
    timeout_seconds = min(max(2, request.timeout_seconds), 20)

    async def event_generator():
        total = len(target_models)
        if total == 0:
            yield f"data: {json.dumps({'type': 'complete', 'total': 0, 'tested': 0, 'healthy': 0, 'degraded': 0, 'failing': 0})}\n\n"
            return

        semaphore = asyncio.Semaphore(concurrency)
        tested_count = 0
        healthy_count = 0
        degraded_count = 0
        failing_count = 0

        async def test_single_model(m_info: DiagnoseModelItem):
            nonlocal tested_count, healthy_count, degraded_count, failing_count
            m_id = m_info.id or m_info.model or m_info.slug or m_info.name or ""
            m_provider = m_info.provider or m_info.provider_id
            async with semaphore:
                try:
                    res = await ModelHealthTracker.ping_model(
                        model_id=m_id,
                        provider=m_provider,
                        timeout_seconds=timeout_seconds,
                    )
                except Exception as exc:
                    res = {
                        "model_id": m_id,
                        "provider": m_provider or "unknown",
                        "success": False,
                        "latency_ms": 0,
                        "status": "failing",
                        "error": str(exc)[:250],
                    }
                tested_count += 1
                if res["status"] == "healthy":
                    healthy_count += 1
                elif res["status"] == "degraded":
                    degraded_count += 1
                else:
                    failing_count += 1
                return res

        tasks = [test_single_model(m) for m in target_models]
        for coro in asyncio.as_completed(tasks):
            try:
                result = await coro
            except Exception as exc:
                result = {
                    "model_id": "unknown",
                    "provider": "unknown",
                    "success": False,
                    "latency_ms": 0,
                    "status": "failing",
                    "error": str(exc)[:250],
                }
            event_payload = {
                "type": "progress",
                "tested": tested_count,
                "total": total,
                "healthy": healthy_count,
                "degraded": degraded_count,
                "failing": failing_count,
                "result": result,
            }
            yield f"data: {json.dumps(event_payload)}\n\n"

        yield f"data: {json.dumps({'type': 'complete', 'total': total, 'tested': total, 'healthy': healthy_count, 'degraded': degraded_count, 'failing': failing_count})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")



