import asyncio
import json
import logging
import uuid

import litellm
import numpy as np
from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.ai.provider_adapter import ProviderAdapter
from app.infrastructure.db.database import get_sessionmaker
from app.infrastructure.db.models import ConversationModel, DeveloperInsightModel, MessageModel
from app.infrastructure.security.credential_manager import CredentialManager

logger = logging.getLogger(__name__)

# Global event for graceful shutdown
shutdown_event = asyncio.Event()


def signal_shutdown():
    logger.info("Signaling Insight Worker to shutdown...")
    shutdown_event.set()


async def run_insight_worker_loop():
    """A lightweight, frictionless background worker running in the asyncio loop.

    Extracts 'pepitas de sabiduría' (Developer Insights) from past unmapped conversations.
    """
    logger.info("SprintLogic REM Sleep: Insight Worker started.")

    # Grace period on startup: wait 30s before first run to allow boot completion
    for _ in range(30):
        if shutdown_event.is_set():
            return
        await asyncio.sleep(1)

    while not shutdown_event.is_set():
        try:
            async with get_sessionmaker()() as session:
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
                        break

                    msg_stmt = (
                        select(MessageModel)
                        .where(MessageModel.conversation_id == conv.id)
                        .order_by(asc(MessageModel.created_at))
                    )
                    msgs_res = await session.execute(msg_stmt)
                    messages = msgs_res.scalars().all()

                    if len(messages) < 2:
                        conv.insight_extracted = True
                        session.add(conv)
                        await session.commit()
                        continue

                    # Consolidate memory!
                    await _extract_and_save_insight(session, conv, messages)

            # Sleep between cycles (5 minutes = 300 seconds)
            for _ in range(300):
                if shutdown_event.is_set():
                    break
                await asyncio.sleep(1)

        except Exception as e:
            logger.warning(f"Insight Worker background loop notice: {e}")
            await asyncio.sleep(10)

    logger.info("Insight Worker gracefully shutdown.")


async def _extract_and_save_insight(
    session: AsyncSession, conv: ConversationModel, messages: list[MessageModel]
) -> None:
    try:
        # Build prompt for LLM to extract "sintoma" and "solucion"
        chat_text = ""
        for m in messages:
            chat_text += f"[{m.role.upper()}]: {m.content}\n"

        from app.infrastructure.ai.prompt_renderer import render_prompt
        from app.infrastructure.repositories.prompt_repository import get_prompt_async

        prompt_model = await get_prompt_async(session, "insight_worker_consolidator")
        if prompt_model:
            system_prompt = render_prompt(prompt_model.content)
        else:
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

        # Model resolution: DB override -> env override -> default
        from app.infrastructure.repositories.tool_model_repository import resolve_tool_model

        provider_id, model_name, fallbacks = await resolve_tool_model(session, "insight_worker")

        api_key = CredentialManager.get_api_key(provider_id)
        if not api_key:
            # Mark conversation as processed to avoid infinite loop when credentials are not configured
            conv.insight_extracted = True
            session.add(conv)
            await session.commit()
            return

        adapted = ProviderAdapter.adapt(model_name, api_key)

        from app.infrastructure.llm.litellm_gateway import LiteLLMGateway

        gateway = LiteLLMGateway()

        try:
            response = await litellm.acompletion(
                model=adapted["model"],
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": chat_text},
                ],
                api_key=adapted.get("api_key", api_key),
                response_format={"type": "json_object"},
                fallbacks=gateway.build_fallback_params(fallbacks),
                num_retries=1,
                timeout=25,
                **adapted.get("kwargs", {}),
            )
        except Exception as llm_err:
            logger.warning(
                f"Insight Worker: No se pudo extraer insight de conversación {conv.id} ({llm_err}). Marcando como procesada."
            )
            conv.insight_extracted = True
            session.add(conv)
            await session.commit()
            return

        raw_content = response.choices[0].message.content if response and response.choices else None
        if not raw_content:
            conv.insight_extracted = True
            session.add(conv)
            await session.commit()
            return

        try:
            data = json.loads(raw_content)
        except Exception:
            conv.insight_extracted = True
            session.add(conv)
            await session.commit()
            return

        if not isinstance(data, dict) or "sintoma" not in data or "solucion" not in data:
            conv.insight_extracted = True
            session.add(conv)
            await session.commit()
            return

        # Generate embedding for semantic search with graceful fallback
        embed_text = f"Síntoma: {data['sintoma']} | Solución: {data['solucion']}"
        from app.infrastructure.config import DEFAULT_EMBEDDING_MODEL

        emb_provider = ProviderAdapter.get_provider(DEFAULT_EMBEDDING_MODEL)
        emb_api_key = (
            CredentialManager.get_api_key(f"sprintlogic_{emb_provider}")
            or CredentialManager.get_api_key(emb_provider)
            or CredentialManager.get_api_key("sprintlogic_openrouter")
            or CredentialManager.get_api_key("openrouter")
            or CredentialManager.get_api_key("gemini")
        )

        embedding_vector: list[float] | None = None
        if emb_api_key or "ollama" in DEFAULT_EMBEDDING_MODEL.lower():
            try:
                adapted = ProviderAdapter.adapt(DEFAULT_EMBEDDING_MODEL, emb_api_key)
                embed_resp = await litellm.aembedding(
                    model=adapted["model"],
                    input=[embed_text],
                    api_key=adapted["api_key"],
                    **adapted["kwargs"],
                )
                if embed_resp and embed_resp.data:
                    embedding_vector = embed_resp.data[0]["embedding"]
            except Exception as emb_err:
                logger.debug(f"Embedding attempt ({DEFAULT_EMBEDDING_MODEL}) failed: {emb_err}")
                gemini_key = CredentialManager.get_api_key("gemini")
                if gemini_key and DEFAULT_EMBEDDING_MODEL != "gemini/embedding-001":
                    try:
                        embed_resp = await litellm.aembedding(
                            model="gemini/embedding-001",
                            input=[embed_text],
                            api_key=gemini_key,
                        )
                        if embed_resp and embed_resp.data:
                            embedding_vector = embed_resp.data[0]["embedding"]
                    except Exception as fallback_err:
                        logger.debug(f"Fallback embedding attempt failed: {fallback_err}")


        # Fallback to zero vector if embedding service is unreachable
        if embedding_vector is not None:
            vector_np = np.array(embedding_vector, dtype=np.float32)
        else:
            vector_np = np.zeros(768, dtype=np.float32)

        # Save to SQLite using DeveloperInsightModel
        insight = DeveloperInsightModel(
            id=str(uuid.uuid4()),
            conversation_id=str(conv.id),
            sintoma=data["sintoma"],
            solucion=data["solucion"],
            snippet_corregido=json.dumps(data.get("snippet_corregido", {})),
            embedding_blob=vector_np.tobytes(),
        )

        session.add(insight)

        # Mark as processed in SQLite
        conv.insight_extracted = True
        session.add(conv)
        await session.commit()

        logger.info(f"Insight consolidado exitosamente para la conversación {conv.id}")

    except Exception as e:
        logger.warning(f"Error procesando insight de conversación {conv.id}: {e}")
        try:
            conv.insight_extracted = True
            session.add(conv)
            await session.commit()
        except Exception:
            pass
