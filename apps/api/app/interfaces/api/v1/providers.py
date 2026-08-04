import logging

logger = logging.getLogger(__name__)
import uuid

import keyring
import litellm
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.models import CustomLLMProviderModel

router = APIRouter()

class CustomProviderCreate(BaseModel):
    name: str
    base_url: str | None = None
    api_key: str

class CustomProviderResponse(BaseModel):
    id: str
    name: str
    base_url: str | None
    api_key_masked: str

class TestProviderRequest(BaseModel):
    base_url: str | None = None
    api_key: str
    model_name: str

@router.post("/", response_model=CustomProviderResponse)
async def create_provider(provider: CustomProviderCreate, db: AsyncSession = Depends(get_db_session)):
    provider_id = str(uuid.uuid4())
    keyring_service_id = f"sprintlogic_custom_{provider_id}"

    keyring.set_password(keyring_service_id, "api_key", provider.api_key)

    new_provider = CustomLLMProviderModel(
        id=provider_id,
        name=provider.name,
        base_url=provider.base_url,
        keyring_service_id=keyring_service_id
    )
    db.add(new_provider)
    await db.commit()
    await db.refresh(new_provider)

    masked = provider.api_key[:3] + "..." + provider.api_key[-4:] if len(provider.api_key) > 8 else "***"
    return CustomProviderResponse(
        id=new_provider.id,
        name=new_provider.name,
        base_url=new_provider.base_url,
        api_key_masked=masked
    )

@router.get("/", response_model=list[CustomProviderResponse])
async def list_providers(db: AsyncSession = Depends(get_db_session)):
    result = await db.execute(select(CustomLLMProviderModel))
    providers = result.scalars().all()

    responses = []
    for p in providers:
        try:
            actual_key = keyring.get_password(p.keyring_service_id, "api_key")
        except Exception:
            logger.warning("Unhandled exception", exc_info=True)
            actual_key = None

        if actual_key and len(actual_key) > 8:
            masked = actual_key[:3] + "..." + actual_key[-4:]
        else:
            masked = "***" if actual_key else "MISSING"

        responses.append(CustomProviderResponse(
            id=p.id,
            name=p.name,
            base_url=p.base_url,
            api_key_masked=masked
        ))
    return responses

@router.post("/test")
async def test_provider(req: TestProviderRequest):
    try:
        kwargs = {
            "model": req.model_name,
            "api_key": req.api_key,
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 1
        }
        if req.base_url:
            kwargs["api_base"] = req.base_url

        response = litellm.completion(**kwargs)
        return {"status": "success", "message": "Test successful", "content": response.choices[0].message.content}
    except Exception as e:
        logger.error("Provider test failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")
