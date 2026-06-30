from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db_session
from app.application.ai_agent import AIAgent
from uuid import UUID

router = APIRouter()

class ChatRequest(BaseModel):
    messages: List[Dict[str, Any]]
    project_id: Optional[str] = None
    model: str = "gemini-1.5-pro-latest"

class ChatResponse(BaseModel):
    response: str

@router.post("/", response_model=ChatResponse)
async def chat_with_ai(request: ChatRequest, session: AsyncSession = Depends(get_db_session)):
    """Handles chat messages with the AI and manages tool calls."""
    try:
        agent = AIAgent(session=session, project_id=request.project_id)
        response_text = await agent.chat(request.messages, model=request.model)
        return {"response": response_text}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
