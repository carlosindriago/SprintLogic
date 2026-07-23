import asyncio
import json
import logging
import uuid

import litellm
import numpy as np
from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.ai.provider_adapter import ProviderAdapter
from app.infrastructure.config import DEFAULT_LLM_MODEL
from app.infrastructure.db.database import AsyncSessionLocal
from app.infrastructure.db.models import ConversationModel, DeveloperInsightModel, MessageModel
from app.infrastructure.security.credential_manager import CredentialManager

logger = logging.getLogger(__name__)

# Global event for graceful shutdown
shutdown_event = asyncio.Event()

def signal_shutdown():
    logger.info("Signaling Insight Worker to shutdown...")
    shutdown_event.set()

async def run_insight_worker_loop():
    """
    A lightweight, frictionless background worker running in the asyncio loop.
    Extracts 'pepitas de sabiduría' (Developer Insights) from past unmapped conversations.
    """
    logger.info("SprintLogic REM Sleep: Insight Worker started.")

    while not shutdown_event.is_set():
        try:
            # Sleep in small increments to allow responsive shutdown
            for _ in range(300): # 5 minutes = 300 seconds
                if shutdown_event.is_set():
                    break
                await asyncio.sleep(1)

            if shutdown_event.is_set():
                break

            async with AsyncSessionLocal() as session:
                # Fetch conversations that have not been processed
                stmt = (
                    select(ConversationModel)
                    .where(ConversationModel.insight_extracted.is_(False))
                    .order_by(asc(ConversationModel.created_at))
                    .limit(5)
                )

                result = await session.execute(stmt)
                unprocessed_convs = result.scalars().all()

                for conv in unprocessed_convs:
                    if shutdown_event.is_set():
                        break # Stop processing new ones, exit gracefully

                    msg_stmt = (
                        select(MessageModel)
                        .where(MessageModel.conversation_id == conv.id)
                        .order_by(asc(MessageModel.created_at))
                    )
                    msgs_res = await session.execute(msg_stmt)
                    messages = msgs_res.scalars().all()

                    if len(messages) < 2:
                        continue # Not enough data

                    # Consolidate memory!
                    await _extract_and_save_insight(session, conv, messages)

        except Exception as e:
            logger.error(f"Error in Insight Worker: {e}")

    logger.info("Insight Worker gracefully shutdown.")

async def _extract_and_save_insight(session: AsyncSession, conv: ConversationModel, messages: list[MessageModel]):
    try:
        # Build prompt for Gemini to extract "sintoma" and "solucion"
        chat_text = ""
        for m in messages:
            chat_text += f"[{m.role.upper()}]: {m.content}\n"

        system_prompt = (
            "Eres el Consolidator de Memoria (Insight Worker) de SprintLogic. "
            "Tu objetivo es leer un hilo de conversación de un desarrollador y extraer una única 'Pepita de Sabiduría'. "
            "Debe representar un anti-patrón corregido, un bug sutil, o una regla de arquitectura acordada.\n\n"
            "Devuelve un JSON estrictamente estructurado así:\n"
            "{\n"
            '  "sintoma": "Descripción breve del problema o anti-patrón encontrado",\n'
            '  "solucion": "El razonamiento arquitectónico o el código correcto a usar",\n'
            '  "snippet_corregido": {"codigo": "..."}\n'
            "}\n"
            "Si la conversación no contiene nada valioso (charlas genéricas), devuelve un JSON vacío: {}."
        )

        provider = ProviderAdapter.get_provider(DEFAULT_LLM_MODEL)
        api_key = CredentialManager.get_api_key(provider)
        if not api_key:
            return

        adapted = ProviderAdapter.adapt(DEFAULT_LLM_MODEL, api_key)

        response = await litellm.acompletion(
            model=adapted["model"],
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": chat_text}
            ],
            api_key=adapted["api_key"],
            response_format={"type": "json_object"},
            **adapted["kwargs"]
        )

        raw_content = response.choices[0].message.content
        if not raw_content:
            return

        data = json.loads(raw_content)
        if "sintoma" not in data or "solucion" not in data:
            return # Empty or invalid JSON means no valuable insight

        # Get embedding for semantic search
        # We concatenate the symptom and solution to create a strong semantic vector
        embed_text = f"Síntoma: {data['sintoma']} | Solución: {data['solucion']}"

        # Fallback to Gemini API key for embeddings if the default provider doesn't support them.
        gemini_api_key = CredentialManager.get_api_key("gemini")
        if not gemini_api_key:
            return

        embed_resp = await litellm.aembedding(
            model="gemini/text-embedding-004",
            input=[embed_text],
            api_key=gemini_api_key
        )

        embedding_vector = embed_resp.data[0]["embedding"]

        # Save to SQLite using DeveloperInsightModel
        vector_np = np.array(embedding_vector, dtype=np.float32)

        insight = DeveloperInsightModel(
            id=str(uuid.uuid4()),
            conversation_id=str(conv.id),
            sintoma=data["sintoma"],
            solucion=data["solucion"],
            snippet_corregido=json.dumps(data.get("snippet_corregido", {})),
            embedding_blob=vector_np.tobytes()
        )

        session.add(insight)

        # Mark as processed in SQLite
        conv.insight_extracted = True
        session.add(conv)
        await session.commit()

        logger.info(f"Insight consolidado para la conversación {conv.id}")

    except Exception as e:
        logger.error(f"Fallo consolidando insight: {e}")
