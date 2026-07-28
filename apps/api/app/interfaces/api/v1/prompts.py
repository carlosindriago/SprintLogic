import logging

logger = logging.getLogger(__name__)
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db_session
from app.infrastructure.repositories import prompt_repository
from app.interfaces.api.v1.prompt_schemas import PromptPatchRequest, PromptResponse

router = APIRouter(prefix="/prompts", tags=["prompts"])

@router.get("", response_model=list[PromptResponse])
async def get_all_prompts(session: AsyncSession = Depends(get_db_session)):
    prompts = await prompt_repository.get_all_prompts(session)
    return prompts

@router.get("/{prompt_id}", response_model=PromptResponse)
async def get_prompt(prompt_id: str, session: AsyncSession = Depends(get_db_session)):
    prompt = await prompt_repository.get_prompt_async(session, prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return prompt

@router.patch("/{prompt_id}", response_model=PromptResponse)
async def update_prompt(prompt_id: str, request: PromptPatchRequest, session: AsyncSession = Depends(get_db_session)):
    prompt = await prompt_repository.get_prompt_async(session, prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")

    req_vars = list(prompt.required_variables) if isinstance(prompt.required_variables, list) else []
    # Check if all required variables are in the current_content as "{var_name}"
    missing_vars = [var for var in req_vars if f"{{{var}}}" not in request.current_content]

    if missing_vars:
        raise HTTPException(status_code=400, detail=f"Missing required variables in current_content: {missing_vars}")

    updated = await prompt_repository.update_prompt(session, prompt_id, request.current_content, req_vars)
    return updated

@router.post("/{prompt_id}/restore", response_model=PromptResponse)
async def restore_prompt(prompt_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        updated = await prompt_repository.restore_prompt(session, prompt_id)
        return updated
    except ValueError as e:
        logger.error("Prompt restore failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred")
