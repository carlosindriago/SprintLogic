import json
import logging

import litellm
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.infrastructure.ai.context7_client import Context7Client
from app.infrastructure.ai.provider_adapter import ProviderAdapter
from app.infrastructure.security.credential_manager import CredentialManager
from app.interfaces.api.v1.settings import CURATED_MODELS, PROVIDER_LABELS

router = APIRouter()

_logger = logging.getLogger("sprintlogic.fim")


class APIKeysPayload(BaseModel):
    gemini_key: str | None = None
    openai_key: str | None = None
    anthropic_key: str | None = None
    openrouter_key: str | None = None
    opencode_zen_key: str | None = None
    opencode_go_key: str | None = None
    nvidia_key: str | None = None


class CodeCoachRequest(BaseModel):
    file_content: str
    language: str = ""
    cursor_line: int = 1
    model: str | None = None
    fallback_model: str | None = None


class CodeCoachMarker(BaseModel):
    line: int
    severity: str
    message: str
    explanation: str


class CodeCoachResponse(BaseModel):
    markers: list[CodeCoachMarker]


@router.get("/models")
async def get_ai_models():
    """Returns the curated model catalog grouped by provider.

    Each provider includes an is_configured flag indicating whether an
    API key has been stored for it. No external APIs are queried.
    """
    results: list[dict] = []
    for provider, models in CURATED_MODELS.items():
        key = CredentialManager.get_api_key(provider)
        results.append(
            {
                "provider": PROVIDER_LABELS.get(provider, provider),
                "provider_id": provider,
                "is_configured": key is not None and key != "",
                "models": models,
            }
        )
    return results


@router.post("/active-models")
async def get_active_models(payload: APIKeysPayload):
    """Returns curated chat/code models grouped by provider with valid API keys."""
    results: list[dict] = []

    key_mapping = {
        "gemini": payload.gemini_key,
        "openai": payload.openai_key,
        "anthropic": payload.anthropic_key,
        "openrouter": payload.openrouter_key,
        "opencode-zen": payload.opencode_zen_key,
        "opencode-go": payload.opencode_go_key,
        "nvidia": payload.nvidia_key,
    }

    for provider, models in CURATED_MODELS.items():
        key = key_mapping.get(provider)
        if key:
            results.append(
                {
                    "provider": provider.upper(),
                    "models": models,
                }
            )
    return results


@router.post("/code-coach", response_model=CodeCoachResponse)
async def code_coach(request: CodeCoachRequest):
    """Asynchronous pedagogical analysis.

    Returns a JSON object with a list of markers.
    """
    if not request.model:
        raise HTTPException(status_code=400, detail="No model specified in request")

    models_to_try = [request.model]
    if request.fallback_model and request.fallback_model != request.model:
        models_to_try.append(request.fallback_model)

    response = None
    last_error = None

    system = (
        "Eres un Mentor Senior de programación. Analiza el código proporcionado. "
        "Si hay vulnerabilidades de seguridad, ineficiencias o una oportunidad clara de enseñar un concepto mejor, "
        "devuelve un arreglo JSON estricto con los diagnósticos. Si el código es perfecto o está incompleto, devuelve un arreglo vacío [].\n\n"
        "El formato JSON esperado DEBE ser un arreglo de objetos exacto:\n"
        '[\n  { "line": 12, "severity": "hint" | "warning" | "error", "message": "Consejo breve", "explanation": "Explicación detallada de por qué" }\n]\n'
        "No incluyas markdown, explicaciones previas ni texto fuera del arreglo JSON."
    )

    user = (
        f"Analiza este código en {request.language or 'código'}. El cursor del usuario está cerca de la línea {request.cursor_line}:\n\n"
        f"```\n{request.file_content}\n```\n\n"
        "Devuelve únicamente el arreglo JSON."
    )

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    for current_model in models_to_try:
        provider = ProviderAdapter.get_provider(current_model)
        api_key = CredentialManager.get_api_key(provider)
        if not api_key:
            _logger.warning("API key not configured for Code Coach model %s", current_model)
            last_error = f"API key not configured for {current_model}"
            continue

        adapted = ProviderAdapter.adapt(current_model, api_key)

        try:
            # Note: We can enable JSON mode if the provider supports it, but for compatibility
            # we rely on the prompt to enforce the JSON array format.
            response = await litellm.acompletion(
                model=adapted["model"],
                messages=messages,
                api_key=adapted["api_key"],
                max_tokens=1000,
                temperature=0.2,
                **adapted["kwargs"],
            )
            break  # Success, exit the loop
        except Exception as e:
            _logger.warning("Code Coach analysis failed with model %s: %s", current_model, e)
            last_error = str(e)
            continue

    if not response:
        _logger.error("All Code Coach model attempts failed. Last error: %s", last_error)
        raise HTTPException(status_code=500, detail=last_error or "All Code Coach model attempts failed.")

    raw = str(response.choices[0].message.content or "").strip()
    raw_clean = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    if not raw_clean:
        return CodeCoachResponse(markers=[])

    try:
        parsed = json.loads(raw_clean)
        if not isinstance(parsed, list):
            parsed = []
            
        markers = []
        for item in parsed:
            if isinstance(item, dict) and "line" in item and "severity" in item and "message" in item and "explanation" in item:
                markers.append(CodeCoachMarker(
                    line=int(item["line"]),
                    severity=str(item["severity"]),
                    message=str(item["message"]),
                    explanation=str(item["explanation"]),
                ))

        return CodeCoachResponse(markers=markers)
    except (json.JSONDecodeError, TypeError, ValueError):
        _logger.error("Failed to parse JSON from Code Coach model. Raw output: %s", raw)
        raise HTTPException(
            status_code=500,
            detail=f"Code Coach Model returned invalid JSON format. Raw output: {raw[:200]}..."
        )
