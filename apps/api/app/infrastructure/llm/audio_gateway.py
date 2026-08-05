import logging
import os
import uuid

import openai
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Utilizamos el cliente asíncrono.
_client = None

def get_openai_client() -> openai.AsyncOpenAI:
    global _client
    if _client is not None:
        return _client

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OpenAI API Key no configurada o inválida."
        )

    try:
        _client = openai.AsyncOpenAI(api_key=api_key)
        return _client
    except Exception as e:
        logger.error("Error initializing OpenAI client: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="OpenAI API Key no configurada o inválida."
        )

async def transcribe_audio(file_bytes: bytes, filename: str) -> str:
    """
    Transcribe audio bytes using OpenAI Whisper.
    """
    client = get_openai_client()

    file_name = filename or f"audio-{uuid.uuid4().hex}.webm"

    try:
        response = await client.audio.transcriptions.create(
            model="whisper-1",
            file=(file_name, file_bytes),
        )
        return response.text
    except openai.AuthenticationError:
        raise HTTPException(
            status_code=500,
            detail="OpenAI API Key no configurada o inválida."
        )
    except Exception as e:
        logger.error("Error in transcription engine: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Error en el motor de transcripción."
        )
