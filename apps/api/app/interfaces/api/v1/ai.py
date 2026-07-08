import json
import logging
import re
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

def _normalize_model_name(model_str: str) -> str:
    """Normalizes model IDs to ensure LiteLLM routing compatibility."""
    if not model_str:
        return ""
        
    if "nvidia_nim/" in model_str:
        return "nvidia_nim/" + model_str.split("nvidia_nim/")[-1]
        
    import os
    if os.getenv("DEFAULT_LLM_PROVIDER") == "openrouter" and not model_str.startswith("openrouter/"):
        return f"openrouter/{model_str}"
        
    return model_str

def _extract_json(text: str) -> str:
    """Robust two-stage JSON extractor to safely parse conversational LLM outputs."""
    if not text:
        return ""
    
    # Phase 1: RegEx no codiciosa para capturar el contenido dentro de bloques de código Markdown
    match = re.search(r"```(?:json)?(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if match:
        extracted = match.group(1).strip()
        if extracted:
            return extracted
            
    # Phase 2: Fallback usando índices absolutos ignorando texto introductorio
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1 and end > start:
        return text[start:end+1]
        
    return text.strip()

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
    icon: str | None = None


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


TECH_RULES = [
    {"name": "TypeScript", "icon": "SiTypescript", "regex": r"interface |type |: string|: number", "doc_url": "https://www.typescriptlang.org/docs/"},
    {"name": "React", "icon": "SiReact", "regex": r"from 'react'|useState|useEffect", "doc_url": "https://react.dev/"},
    {"name": "Python", "icon": "SiPython", "regex": r"def |import |class |asyncio", "doc_url": "https://docs.python.org/3/"},
    {"name": "Next.js", "icon": "SiNextdotjs", "regex": r"next/|NEXT_PUBLIC", "doc_url": "https://nextjs.org/docs"},
    {"name": "FastAPI", "icon": "SiFastapi", "regex": r"from fastapi|import FastAPI|APIRouter", "doc_url": "https://fastapi.tiangolo.com/"},
    {"name": "Tailwind CSS", "icon": "SiTailwindcss", "regex": r"className=.*flex|className=.*text-|className=.*bg-", "doc_url": "https://tailwindcss.com/"},
    {"name": "Node.js", "icon": "SiNodedotjs", "regex": r"require\(|module.exports|process\.env", "doc_url": "https://nodejs.org/"},
    {"name": "Docker", "icon": "SiDocker", "regex": r"FROM |RUN |WORKDIR |CMD |ENTRYPOINT", "doc_url": "https://docs.docker.com/"},
    {"name": "SQL", "icon": "SiPostgresql", "regex": r"SELECT |INSERT |UPDATE |DELETE |FROM ", "doc_url": "https://dev.mysql.com/doc/"},
    {"name": "HTML5", "icon": "SiHtml5", "regex": r"<div|<span|<html|<body", "doc_url": "https://developer.mozilla.org/es/docs/Web/HTML"},
    {"name": "CSS3", "icon": "SiCss3", "regex": r"margin:|padding:|color:|background:", "doc_url": "https://developer.mozilla.org/es/docs/Web/CSS"},
]

@router.post("/tech-scan", response_model=TechScanResponse)
async def tech_scan(request: TechScanRequest):
    """Analizador estático de stack técnico usando regex."""
    try:
        content = request.file_content or ""
        techs = []
        
        for tech_data in TECH_RULES:
            if re.search(tech_data["regex"], content):
                techs.append(TechInfo(
                    name=tech_data["name"],
                    version="N/A",
                    doc_url=tech_data["doc_url"],
                    icon=tech_data["icon"]
                ))
                
        if not techs:
            lang_str = request.language if getattr(request, 'language', None) else "Desconocido"
            techs.append(TechInfo(
                name=f"Código Básico ({lang_str})",
                version="N/A",
                doc_url="#",
                icon="SiGnubash"
            ))
            
        return TechScanResponse(technologies=techs)
        
    except Exception as e:
        _logger.error(f"[TECH SCAN ERROR] {str(e)}")
        lang_str = request.language if getattr(request, 'language', None) else "Desconocido"
        return {"technologies": [{"name": f"Error Analizador ({lang_str})", "version": "N/A", "doc_url": "#", "icon": "SiGnubash"}]}


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
            "No incluyas markdown, explicaciones previas ni texto fuera del objeto JSON. "
            'CRÍTICO: TIENES PROHIBIDO PENSAR EN VOZ ALTA. NO expliques tu razonamiento fuera del JSON. Devuelve ÚNICAMENTE un objeto JSON válido que empiece con "{" y termine con "}". Cualquier texto adicional causará un fallo crítico en el sistema.'
        )

        user = (
            f"Analiza este código en {request.language or 'código'}. El cursor del usuario está cerca de la línea {request.cursor_line}:\n\n"
            f"```\n{request.file_content}\n```\n\n"
            "Devuelve únicamente el objeto JSON."
        )

        MAX_RETRIES = 2
        for current_model in models_to_try:
            provider = ProviderAdapter.get_provider(current_model)
            api_key = CredentialManager.get_api_key(provider)
            if not api_key:
                _logger.warning("API key not configured for Code Coach model %s", current_model)
                last_error = f"API key not configured for {current_model}"
                continue

            adapted = ProviderAdapter.adapt(current_model, api_key)

            model_messages = [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ]

            success = False
            for attempt in range(MAX_RETRIES + 1):
                raw_content = ""
                try:
                    import asyncio
                    response = await asyncio.wait_for(
                        litellm.acompletion(
                            model=_normalize_model_name(adapted["model"]),
                            messages=model_messages,
                            api_key=adapted["api_key"],
                            max_tokens=4000,
                            temperature=0.1,
                            timeout=15,
                            **adapted["kwargs"],
                        ),
                        timeout=25.0
                    )
                    
                    raw_content = str(response.choices[0].message.content or "").strip()
                    _logger.info(f"[CODE COACH RAW] {raw_content}")
                    raw_clean = _extract_json(raw_content)

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

                    success = True
                    break  # Exit retry loop
                    
                except Exception as e:
                    # If raw_content is empty, it means the API call itself failed (e.g. network, auth)
                    if not raw_content:
                        _logger.warning("Code Coach API call failed with model %s: %s", current_model, e)
                        last_error = str(e)
                        break  # Move to fallback model
                    
                    # If raw_content exists, LLM responded but JSON parsing/validation failed
                    if attempt < MAX_RETRIES:
                        _logger.warning(f"[AI COACH] Intento {attempt + 1} falló por JSON corrupto. Lanzando auto-sanación...")
                        model_messages.append({"role": "assistant", "content": raw_content})
                        model_messages.append({
                            "role": "user",
                            "content": f"ERROR DE PARSEO: Tu respuesta previa no es un JSON válido o viola el esquema estricto de Pydantic. Error detectado: {str(e)}. Por favor, re-analiza el código y devuelve ÚNICAMENTE un objeto JSON puro, perfectamente cerrado, sin bloques de código markdown (```) ni explicaciones de texto plano fuera del esquema."
                        })
                        continue
                    else:
                        _logger.warning(f"[AI COACH] Auto-sanación agotó los reintentos (MAX_RETRIES={MAX_RETRIES}).")
                        last_error = f"JSON Parse Error after retries: {str(e)}"
                        break  # Move to fallback model

            if success:
                return CodeCoachResponse(overview=overview, contextual_advice=markers)

        if not success:
            raise ValueError(f"All Code Coach model attempts failed. Last error: {last_error}")

    except Exception as e:
        _logger.error(f"Code Coach Fallback triggered: {str(e)}")
        
        error_str = str(e).lower()
        if "400" in error_str or "bad request" in error_str or "invalid model" in error_str:
            fallback_msg = "Error 400: Modelo IA Inválido. El ID del modelo configurado no existe o no es soportado por el proveedor. Por favor, cámbialo en la configuración."
        elif "429" in error_str or "rate limit" in error_str:
            fallback_msg = "Error 429: Límite de peticiones excedido. El proveedor de IA (Rate Limit) ha bloqueado la conexión. Por favor, verifica tus cuotas, cambia a tu modelo de respaldo, o espera un minuto."
        elif "401" in error_str or "authentication" in error_str:
            fallback_msg = "Error 401: Credenciales inválidas. Verifica tu API Key en la configuración."
        else:
            fallback_msg = "Análisis pedagógico temporalmente degradado debido a inestabilidad en el formato del proveedor de IA. Por favor, realiza una pequeña modificación en el código o presiona Re-escanear para forzar una nueva evaluación."
            
        return {
            "overview": {
                "structure": fallback_msg,
                "critical_security": "N/A",
                "clean_code_score": 0,
                "is_degraded": True
            },
            "contextual_advice": []
        }
