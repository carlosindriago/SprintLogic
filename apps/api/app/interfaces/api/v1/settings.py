from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.infrastructure.security.credential_manager import CredentialManager

router = APIRouter()

class APIKeyRequest(BaseModel):
    api_key: str

class APIKeyStatus(BaseModel):
    is_configured: bool

@router.get("/api-key", response_model=APIKeyStatus)
async def check_api_key_status():
    """Checks if the Gemini API key is configured."""
    key = CredentialManager.get_api_key()
    return {"is_configured": bool(key)}

@router.post("/api-key")
async def save_api_key(request: APIKeyRequest):
    """Saves the Gemini API key securely."""
    if not request.api_key:
        raise HTTPException(status_code=400, detail="API key cannot be empty")
    
    CredentialManager.save_api_key(request.api_key)
    return {"status": "success", "message": "API key saved securely"}

@router.delete("/api-key")
async def delete_api_key():
    """Deletes the saved Gemini API key."""
    CredentialManager.delete_api_key()
    return {"status": "success", "message": "API key deleted"}
