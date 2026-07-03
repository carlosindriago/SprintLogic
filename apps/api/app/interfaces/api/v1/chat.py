from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
import json
import litellm

from app.infrastructure.db.database import get_db_session
from app.application.ai_agent import AIAgent
from app.infrastructure.security.credential_manager import CredentialManager
from uuid import UUID

router = APIRouter()


SENSEI_SYSTEM_PROMPT = (
    "Eres un Arquitecto de Software y Mentor Técnico (Modo Sensei). "
    "Tu objetivo es ayudar al usuario a entender el código y aprender "
    "a programar por sí mismo. Reglas estrictas: "
    "1. Explica qué hace el archivo en la arquitectura global. "
    "2. Identifica áreas de mejora. "
    "3. Si el usuario pide agregar funcionalidad, explícale LA LÓGICA, "
    "EL FLUJO DE DATOS y dale ENLACES o REFERENCIAS a la documentación "
    "oficial del Tech Stack proporcionado. "
    "4. TIENES ESTRICTAMENTE PROHIBIDO ESCRIBIR BLOQUES DE CÓDIGO LISTOS "
    "PARA COPIAR Y PEGAR. Solo puedes usar pseudocódigo muy abstracto o "
    "pequeños snippets ilustrativos de 1 o 2 líneas."
)


class MentorRequest(BaseModel):
    file_path: str
    content: str
    project_tech_stack: Dict[str, Any] = {}
    user_query: str = "Hazme un desglose arquitectónico de este archivo"


class MentorResponse(BaseModel):
    response: str


@router.post("/mentor", response_model=MentorResponse)
async def mentor_sensei(request: MentorRequest):
    provider = "gemini"
    model = "gemini/gemini-2.5-flash"
    api_key = CredentialManager.get_api_key(provider)
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API key not configured")

    user_message = (
        f"Archivo: {request.file_path}\n\n"
        f"Tech Stack del proyecto: {json.dumps(request.project_tech_stack, indent=2)}\n\n"
        f"Código del archivo:\n```\n{request.content[:8000]}\n```\n\n"
        f"Pregunta del usuario: {request.user_query}"
    )

    try:
        response = await litellm.acompletion(
            model=model,
            messages=[
                {"role": "system", "content": SENSEI_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            api_key=api_key,
        )
        return {"response": str(response.choices[0].message.content)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mentor error: {str(e)}")
