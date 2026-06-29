from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.infrastructure.security.credential_manager import CredentialManager

router = APIRouter()

class APIKeyRequest(BaseModel):
    api_key: str

class APIKeyStatus(BaseModel):
    is_configured: bool

@router.get("/api-key/{provider}", response_model=APIKeyStatus)
async def check_api_key_status(provider: str):
    """Checks if the API key for a provider is configured."""
    key = CredentialManager.get_api_key(provider)
    return {"is_configured": bool(key)}

@router.post("/api-key/{provider}")
async def save_api_key(provider: str, request: APIKeyRequest):
    """Saves the API key securely for a provider."""
    if not request.api_key:
        raise HTTPException(status_code=400, detail="API key cannot be empty")
    
    CredentialManager.save_api_key(provider, request.api_key)
    return {"status": "success", "message": f"API key for {provider} saved securely"}

@router.delete("/api-key/{provider}")
async def delete_api_key(provider: str):
    """Deletes the saved API key for a provider."""
    CredentialManager.delete_api_key(provider)
    return {"status": "success", "message": f"API key for {provider} deleted"}
