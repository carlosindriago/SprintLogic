from fastapi import APIRouter
from pydantic import BaseModel

from app.infrastructure.security.credential_manager import CredentialManager
from app.interfaces.api.v1.settings import CURATED_MODELS, PROVIDER_LABELS

router = APIRouter()


class APIKeysPayload(BaseModel):
    gemini_key: str | None = None
    openai_key: str | None = None
    anthropic_key: str | None = None
    openrouter_key: str | None = None
    opencode_zen_key: str | None = None
    opencode_go_key: str | None = None
    nvidia_key: str | None = None


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
