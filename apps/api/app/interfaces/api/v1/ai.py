from fastapi import APIRouter
from app.infrastructure.security.credential_manager import CredentialManager
from app.interfaces.api.v1.settings import CURATED_MODELS, PROVIDER_LABELS

router = APIRouter()

@router.get("/active-models")
async def get_active_models():
    """Returns curated chat/code models grouped by provider with valid API keys."""
    results: list[dict] = []
    for provider, models in CURATED_MODELS.items():
        key = CredentialManager.get_api_key(provider)
        if key:
            results.append({
                "provider": provider.upper(),
                "models": models,
            })
    return results
