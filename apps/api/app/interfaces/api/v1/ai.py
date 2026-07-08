import json
import logging

import litellm
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.infrastructure.ai.context7_client import Context7Client
from app.infrastructure.ai.provider_adapter import ProviderAdapter
from app.infrastructure.security.credential_manager import CredentialManager
from app.interfaces.api.v1.settings import CURATED_MODELS, PROVIDER_LABELS, fetch_provider_models, ProviderFetchError

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
    suggested_code: str | None = None


class CodeCoachOverview(BaseModel):
    structure: str
    critical_security: str
    clean_code_score: int
    is_degraded: bool = False


class CodeCoachResponse(BaseModel):
    overview: CodeCoachOverview
    contextual_advice: list[CodeCoachMarker]


class TechScanRequest(BaseModel):
    file_content: str
    language: str = ""
    model: str | None = None
    fallback_model: str | None = None


class TechInfo(BaseModel):
    name: str
    version: str
    doc_url: str


class TechScanResponse(BaseModel):
    technologies: list[TechInfo]


@router.get("/models")
async def get_ai_models():
    """Returns the curated model catalog grouped by provider.

    Each provider includes an is_configured flag indicating whether an
    API key has been stored for it. No external APIs are queried.
    """
    results: list[dict] = []
    for provider, fallback_models in CURATED_MODELS.items():
        key = CredentialManager.get_api_key(provider)
        is_configured = key is not None and key != ""
        
        models = fallback_models
        if is_configured:
            try:
                models = await fetch_provider_models(provider, key)
            except ProviderFetchError:
                pass

        results.append(
            {
                "provider": PROVIDER_LABELS.get(provider, provider),
                "provider_id": provider,
                "is_configured": is_configured,
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

    for provider, fallback_models in CURATED_MODELS.items():
        key = key_mapping.get(provider)
        if key:
            try:
                models = await fetch_provider_models(provider, key)
            except ProviderFetchError:
                models = fallback_models
                
            results.append(
                {
                    "provider": provider.upper(),
                    "models": models,
                }
            )
    return results


@router.post("/tech-scan", response_model=TechScanResponse)
async def tech_scan(request: TechScanRequest):
    """Escaner estático de tecnologías en el archivo."""
    try:
        if not request.model:
            raise ValueError("No model specified in request")

        models_to_try = [request.model]
        if request.fallback_model and request.fallback_model != request.model:
            models_to_try.append(request.fallback_model)

        response = None
        last_error = None

        system = (
            "Eres un analizador técnico experto (Tech Scanner). Tu tarea es identificar las tecnologías, "
            "frameworks, lenguajes o librerías principales en este código, así como deducir o sugerir sus "
            "versiones recientes y proveer las URLs oficiales de documentación.\n\n"
            "Devuelve EXCLUSIVAMENTE un JSON con la siguiente estructura exacta:\n"
            '{"technologies": [{"name": "React", "version": "18.x", "doc_url": "https://react.dev"}]}'
        )

        user = (
            f"Analiza este código en {request.language or 'código'}:\n\n"
            f"```\n{request.file_content}\n```\n\n"
            "Devuelve únicamente el objeto JSON."
        )

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]

        for current_model in models_to_try:
            provider = ProviderAdapter.get_provider(current_model)
            api_key = CredentialManager.get_api_key(provider)
            if not api_key:
                last_error = f"API key not configured for {current_model}"
                continue

            adapted = ProviderAdapter.adapt(current_model, api_key)

            try:
                import asyncio
                response = await asyncio.wait_for(
                    litellm.acompletion(
                        model=adapted["model"],
                        messages=messages,
                        api_key=adapted["api_key"],
                        max_tokens=500,
                        temperature=0.1,
                        **adapted["kwargs"],
                    ),
                    timeout=15.0
                )
                break
            except Exception as e:
                last_error = str(e)
                continue

        if not response:
            raise ValueError(f"All models failed or timed out. Last error: {last_error}")

        raw = str(response.choices[0].message.content or "").strip()
        raw_clean = raw.strip().strip('`').strip('json').strip('\n').strip()
        parsed = json.loads(raw_clean)
        
        techs = []
        for item in parsed.get("technologies", []):
            techs.append(TechInfo(
                name=str(item.get("name", "Unknown")),
                version=str(item.get("version", "latest")),
                doc_url=str(item.get("doc_url", "#"))
            ))
        return TechScanResponse(technologies=techs)

    except Exception as e:
        _logger.error(f"Tech Scan Fallback triggered: {str(e)}")
        lang_str = request.language if getattr(request, 'language', None) else "Desconocido"
        return {"technologies": [{"name": f"Análisis Básico ({lang_str})", "version": "N/A", "doc_url": "#"}]}


@router.post("/code-coach", response_model=CodeCoachResponse)
async def code_coach(request: CodeCoachRequest):
    """Analizador de código que detecta antipatrones y sugiere mejoras."""
    try:
        if not request.model:
            raise ValueError("No model specified in request")

        models_to_try = [request.model]
        if request.fallback_model and request.fallback_model != request.model:
            models_to_try.append(request.fallback_model)

        response = None
        last_error = None

        system = (
            "Eres un Mentor Senior de programación. Analiza el código proporcionado. "
            "Devuelve EXCLUSIVAMENTE un objeto JSON estricto con dos partes: un 'overview' general "
            "y 'contextual_advice' que es un arreglo de consejos pedagógicos mapeados a las líneas del código.\n\n"
            "Estructura EXACTA requerida:\n"
            "{\n"
            '  "overview": { "structure": "Breve descripción", "critical_security": "Advertencias si las hay, o None", "clean_code_score": 85 },\n'
            '  "contextual_advice": [\n'
            '    { "line": 12, "severity": "hint" | "warning" | "error", "message": "Consejo breve", "explanation": "Explicación", "suggested_code": "fragmento de código con la solución correcta, o null si no aplica" }\n'
            "  ]\n"
            "}\n"
            "No incluyas markdown, explicaciones previas ni texto fuera del objeto JSON."
        )

        user = (
            f"Analiza este código en {request.language or 'código'}. El cursor del usuario está cerca de la línea {request.cursor_line}:\n\n"
            f"```\n{request.file_content}\n```\n\n"
            "Devuelve únicamente el objeto JSON."
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
                import asyncio
                response = await asyncio.wait_for(
                    litellm.acompletion(
                        model=adapted["model"],
                        messages=messages,
                        api_key=adapted["api_key"],
                        max_tokens=1000,
                        temperature=0.2,
                        **adapted["kwargs"],
                    ),
                    timeout=25.0
                )
                break  # Success, exit the loop
            except Exception as e:
                _logger.warning("Code Coach analysis failed with model %s: %s", current_model, e)
                last_error = str(e)
                continue

        if not response:
            raise ValueError(f"All Code Coach model attempts failed. Last error: {last_error}")

        raw = str(response.choices[0].message.content or "").strip()
        raw_clean = raw.strip().strip('`').strip('json').strip('\n').strip()

        if not raw_clean:
            raise ValueError("Empty response from LLM")

        parsed = json.loads(raw_clean)
        
        overview_data = parsed.get("overview", {})
        overview = CodeCoachOverview(
            structure=str(overview_data.get("structure", "")),
            critical_security=str(overview_data.get("critical_security", "")),
            clean_code_score=int(overview_data.get("clean_code_score", 100)),
            is_degraded=False
        )
            
        markers = []
        for item in parsed.get("contextual_advice", []):
            if isinstance(item, dict) and "line" in item and "severity" in item and "message" in item and "explanation" in item:
                markers.append(CodeCoachMarker(
                    line=int(item["line"]),
                    severity=str(item["severity"]),
                    message=str(item["message"]),
                    explanation=str(item["explanation"]),
                    suggested_code=item.get("suggested_code")
                ))

        return CodeCoachResponse(overview=overview, contextual_advice=markers)

    except Exception as e:
        _logger.error(f"Code Coach Fallback triggered: {str(e)}")
        return {
            "overview": {
                "structure": "Análisis no disponible debido a un error de conexión con el proveedor de IA.",
                "critical_security": "N/A",
                "clean_code_score": 0,
                "is_degraded": True
            },
            "contextual_advice": []
        }
