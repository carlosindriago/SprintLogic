from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db_session
from app.application.jarvis_agent import JarvisAgent

router = APIRouter()

class ChatRequest(BaseModel):
    messages: List[Dict[str, Any]]
    project_id: Optional[int] = None

class ChatResponse(BaseModel):
    response: str

@router.post("/", response_model=ChatResponse)
async def chat_with_jarvis(request: ChatRequest, session: AsyncSession = Depends(get_db_session)):
    """Handles chat messages with Jarvis and manages tool calls."""
    try:
        agent = JarvisAgent(session=session, project_id=request.project_id)
        response_text = await agent.chat(request.messages)
        return {"response": response_text}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
