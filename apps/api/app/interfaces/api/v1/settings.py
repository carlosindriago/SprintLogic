from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.infrastructure.security.credential_manager import CredentialManager
from app.infrastructure.ai.llm_gateway import LiteLLMGateway
import httpx
import time

router = APIRouter()
llm_gateway = LiteLLMGateway()

# Simple in-memory cache for models, especially useful for openrouter
_model_cache = {}
CACHE_TTL = 300  # 5 minutes

class APIKeyRequest(BaseModel):
    api_key: str

class ModelResult(BaseModel):
    id: str
    name: str

async def fetch_provider_models(provider: str, api_key: str) -> list[dict]:
    # Check cache first for openrouter
    now = time.time()
    if provider in _model_cache:
        cache_entry = _model_cache[provider]
        if now - cache_entry["timestamp"] < CACHE_TTL:
            return cache_entry["models"]

    models = []
    async with httpx.AsyncClient() as client:
        try:
            if provider == "gemini":
                res = await client.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}")
                if res.status_code == 200:
                    data = res.json()
                    models = [{"id": m["name"].replace("models/", ""), "name": m["displayName"]} for m in data.get("models", []) if "generateContent" in m.get("supportedGenerationMethods", [])]
                else:
                    raise HTTPException(status_code=400, detail=f"Invalid Gemini Key: {res.text}")
            elif provider == "openai":
                res = await client.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {api_key}"})
                if res.status_code == 200:
                    data = res.json()
                    models = [{"id": m["id"], "name": m["id"]} for m in data.get("data", []) if "gpt" in m["id"] or "o1" in m["id"]]
                else:
                    raise HTTPException(status_code=400, detail=f"Invalid OpenAI Key")
            elif provider == "anthropic":
                res = await client.get("https://api.anthropic.com/v1/models", headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"})
                if res.status_code == 200:
                    data = res.json()
                    models = [{"id": m["id"], "name": m.get("display_name", m["id"])} for m in data.get("data", [])]
                else:
                    # Fallback if endpoint is not available or old key
                    models = [{"id": "claude-3-opus-20240229", "name": "Claude 3 Opus"}, {"id": "claude-3-sonnet-20240229", "name": "Claude 3 Sonnet"}, {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku"}, {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet"}]
            elif provider == "openrouter":
                res = await client.get("https://openrouter.ai/api/v1/models")
                if res.status_code == 200:
                    data = res.json()
                    models = [{"id": m["id"], "name": m.get("name", m["id"])} for m in data.get("data", [])]
                else:
                    raise HTTPException(status_code=400, detail="Failed to fetch OpenRouter models")
            elif provider == "opencode-zen":
                res = await client.get("https://opencode.ai/zen/v1/models", headers={"Authorization": f"Bearer {api_key}"})
                if res.status_code == 200:
                    data = res.json()
                    models = [{"id": m["id"], "name": m["id"]} for m in data.get("data", [])]
                else:
                    raise HTTPException(status_code=400, detail="Invalid OpenCode Zen Key")
            elif provider == "opencode-go":
                res = await client.get("https://opencode.ai/zen/go/v1/models", headers={"Authorization": f"Bearer {api_key}"})
                if res.status_code == 200:
                    data = res.json()
                    models = [{"id": m["id"], "name": m["id"]} for m in data.get("data", [])]
                else:
                    raise HTTPException(status_code=400, detail="Invalid OpenCode Go Key")
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
        except httpx.RequestError as e:
            raise HTTPException(status_code=400, detail=f"Network error: {str(e)}")

    if provider == "openrouter":
        _model_cache[provider] = {"timestamp": now, "models": models}
        
    return models

@router.get("/providers/{provider}/models", response_model=list[ModelResult])
async def get_provider_models(provider: str):
    """Fetches available models for a provider using the stored API key."""
    api_key = CredentialManager.get_api_key(provider)
    if not api_key:
        raise HTTPException(status_code=404, detail=f"API key for {provider} not found")
        
    return await fetch_provider_models(provider, api_key)

@router.post("/providers/{provider}/keys", response_model=list[ModelResult])
async def save_and_verify_provider_key(provider: str, request: APIKeyRequest):
    """Verifies and saves the API key, returning the list of available models."""
    if not request.api_key:
        raise HTTPException(status_code=400, detail="API key cannot be empty")
        
    # Attempt to fetch models to validate the key
    models = await fetch_provider_models(provider, request.api_key)
    
    # If successful, save the key
    CredentialManager.save_api_key(provider, request.api_key)
    return models

class APIKeyStatus(BaseModel):
    is_configured: bool

@router.get("/api-key/{provider}", response_model=APIKeyStatus)
async def check_api_key_status(provider: str):
    """Checks if the API key for a provider is configured."""
    key = CredentialManager.get_api_key(provider)
    return {"is_configured": bool(key)}

@router.delete("/api-key/{provider}")
async def delete_api_key(provider: str):
    """Deletes the saved API key for a provider."""
    CredentialManager.delete_api_key(provider)
    return {"status": "success", "message": f"API key for {provider} deleted"}

@router.post("/verify-api-key/{provider}")
async def verify_api_key(provider: str, request: APIKeyRequest):
    """Verifies the provided API key by making a minimal call to the provider."""
    if not request.api_key:
        raise HTTPException(status_code=400, detail="API key cannot be empty")
    
    # We map provider to a fast/cheap model to test
    test_models = {
        "gemini": "gemini/gemini-2.5-flash",
        "openai": "gpt-4o-mini",
        "anthropic": "claude-3-haiku-20240307",
        "openrouter": "openrouter/auto",
        "opencode-zen": "gpt-5-mini",
        "opencode-go": "glm-5.2"
    }
    
    model = test_models.get(provider)
    if not model:
        raise HTTPException(status_code=400, detail=f"Unsupported provider for verification: {provider}")
        
    try:
        # We need a way to pass the key explicitly or temporarily save it?
        # LiteLLMGateway uses CredentialManager.get_api_key. 
        # Let's save it temporarily or bypass.
        # It's safer to just save it, verify, and if it fails, the user knows.
        # Since they are clicking "Verify", they intend to use it.
        CredentialManager.save_api_key(provider, request.api_key)
        
        # Test completion
        llm_gateway.generate_completion(prompt="Hello", model=model, max_tokens=5)
        return {"status": "success", "message": "Conexión verificada exitosamente"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Fallo en la verificación: {str(e)}")
