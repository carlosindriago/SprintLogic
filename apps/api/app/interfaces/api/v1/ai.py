import logging
import re

import litellm
from fastapi import APIRouter
from pydantic import BaseModel

from app.infrastructure.ai.provider_adapter import ProviderAdapter
from app.infrastructure.security.credential_manager import CredentialManager
from app.interfaces.api.v1.settings import (
    CURATED_MODELS,
    PROVIDER_LABELS,
    ProviderFetchError,
    fetch_provider_models,
)

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
    start_dict = text.find('{')
    end_dict = text.rfind('}')
    start_list = text.find('[')
    end_list = text.rfind(']')

    has_dict = start_dict != -1 and end_dict != -1 and end_dict > start_dict
    has_list = start_list != -1 and end_list != -1 and end_list > start_list

    if has_dict and has_list:
        if start_dict < start_list:
            return text[start_dict:end_dict+1]
        else:
            return text[start_list:end_list+1]
    elif has_list:
        return text[start_list:end_list+1]
    elif has_dict:
        return text[start_dict:end_dict+1]

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
    native_errors: list[str] | None = None
    model: str | None = None
    fallback_model: str | None = None


class CodeCoachMarker(BaseModel):
    line: int
    severity: str
    message: str
    title: str | None = None
    explanation: str
    suggested_code: str | None = None
    snippet_before: str | None = None
    snippet_after: str | None = None
    is_degraded: bool = False


class CodeCoachOverview(BaseModel):
    structure: str
    critical_security: str
    clean_code_score: int
    technical_debt_and_tips: list[str] = []
    is_degraded: bool = False
    error_detail: str | None = None


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
    {"name": "CSS3", "icon": "SiCss", "regex": r"margin:|padding:|color:|background:", "doc_url": "https://developer.mozilla.org/es/docs/Web/CSS"},
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


@router.post("/health-overview", response_model=CodeCoachOverview)
async def health_overview(request: CodeCoachRequest):
    """Analizador de código que devuelve una vista general (Health & Overview)."""
    try:
        if not request.model:
            raise ValueError("No model specified in request")

        models_to_try = [request.model]
        if request.fallback_model and request.fallback_model != request.model:
            models_to_try.append(request.fallback_model)

        last_error = None

        system = (
            "Eres un Arquitecto de Software. Analiza el código proporcionado. "
            "Devuelve EXCLUSIVAMENTE un objeto JSON estricto con un 'overview' general.\n\n"
            "Además del score y la estructura, actúa como un Staff Engineer haciendo un Code Review. "
            "Provee 2 o 3 consejos arquitectónicos críticos en el array technical_debt_and_tips. "
            "Enfócate en vulnerabilidades de seguridad, violaciones al principio DRY, manejo de errores, y patrones de diseño. "
            "Sé directo y profesional.\n\n"
            "Estructura EXACTA requerida:\n"
            "{\n"
            '  "structure": "Breve descripción",\n'
            '  "critical_security": "Advertencias si las hay, o None",\n'
            '  "clean_code_score": 85,\n'
            '  "technical_debt_and_tips": ["tip 1", "tip 2"]\n'
            "}\n\n"
            "EJEMPLO DE SALIDA ESPERADA:\n"
            '{"clean_code_score": 85, "structure": "El código es modular pero carece de tipado estricto.", "critical_security": "None", "technical_debt_and_tips": ["Añadir validación estricta de tipos", "Implementar patrón repositorio para la BD"]}\n\n'
            "No incluyas markdown, explicaciones previas ni texto fuera del objeto JSON. "
            "CRÍTICO: TIENES PROHIBIDO PENSAR EN VOZ ALTA. NO expliques tu razonamiento fuera del JSON."
        )

        lines = request.file_content.split('\n')
        if len(lines) > 300:
            truncated_content = '\n'.join(lines[:150]) + '\n\n... [CÓDIGO TRUNCADO POR TAMAÑO] ...\n\n' + '\n'.join(lines[-150:])
        else:
            truncated_content = request.file_content

        user = (
            f"Analiza este código en {request.language or 'código'}:\n\n"
            f"```\n{truncated_content}\n```\n\n"
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

            
            for attempt in range(MAX_RETRIES + 1):
                raw_content = ""
                try:
                    import asyncio
                    response = await asyncio.wait_for(
                        litellm.acompletion(
                            model=_normalize_model_name(adapted["model"]),
                            messages=model_messages,
                            api_key=adapted["api_key"],
                            max_tokens=1000,
                            temperature=0.0,
                            timeout=60,
                            **adapted["kwargs"],
                        ),
                        timeout=65.0
                    )

                    raw_content = str(response.choices[0].message.content or "").strip()
                    raw_clean = _extract_json(raw_content)

                    if not raw_clean:
                        raise ValueError("Empty response from LLM")

                    import json
                    parsed = json.loads(raw_clean)

                    overview = CodeCoachOverview(
                        structure=str(parsed.get("structure", "")),
                        critical_security=str(parsed.get("critical_security", "")),
                        clean_code_score=int(parsed.get("clean_code_score", 100)),
                        technical_debt_and_tips=parsed.get("technical_debt_and_tips", []),
                        is_degraded=False
                    )

                    return overview

                except Exception as e:
                    if not raw_content:
                        _logger.warning("Health Overview API call failed with model %s: %s", current_model, e)
                        last_error = repr(e)
                        break

                    if attempt < MAX_RETRIES:
                        model_messages.append({"role": "assistant", "content": raw_content})
                        model_messages.append({
                            "role": "user",
                            "content": f"ERROR DE PARSEO: {str(e)}. Devuelve JSON puro sin formato extra."
                        })
                        continue
                    else:
                        last_error = f"JSON Parse Error after retries: {str(e)}"
                        break

        raise ValueError(f"All model attempts failed. Last error: {last_error}")

    except Exception as e:
        error_msg = repr(e)
        _logger.error(f"Health Overview Fallback triggered: {error_msg}")

        return CodeCoachOverview(
            structure="Fallo del proveedor IA",
            critical_security="N/A",
            clean_code_score=0,
            technical_debt_and_tips=[],
            is_degraded=True,
            error_detail=f"Fallo del proveedor IA: {error_msg}"
        )


@router.post("/contextual-mentorship", response_model=list[CodeCoachMarker])
async def contextual_mentorship(request: CodeCoachRequest):
    """Analizador de código que detecta antipatrones (Mentoría Contextual)."""
    try:
        if not request.model:
            raise ValueError("No model specified in request")

        models_to_try = [request.model]
        if request.fallback_model and request.fallback_model != request.model:
            models_to_try.append(request.fallback_model)

        last_error = None

        system = (
            "Eres un Mentor Senior de programación. Analiza el código proporcionado. "
            "Devuelve EXCLUSIVAMENTE un arreglo JSON de consejos pedagógicos mapeados a las líneas del código.\n\n"
            "El código proporcionado tiene números de línea explícitos al inicio de cada renglón (ej. [Line 45]). NUNCA adivines ni cuentes las líneas. Cuando reportes un error, extrae EXACTAMENTE el número que aparece entre corchetes en esa línea de código y ponlo en el campo line_number del JSON.\n\n"
            "Si recibes native_errors, prioriza explicar y resolver estos errores de compilación antes de sugerir mejoras de estilo.\n\n"
            "Estructura EXACTA requerida:\n"
            "[\n"
            '  { "line": 12, "severity": "hint" | "warning" | "error", "title": "Título corto", "message": "Consejo breve", "explanation": "El campo explanation DEBE ser extenso, profundo y altamente pedagógico. No te limites a decir qué está mal. Explica el \\"Por qué\\", los riesgos reales (ej. memoria, seguridad, mantenibilidad) y por qué la solución propuesta (snippet_after) es el estándar de un Senior Engineer. Habla como un mentor experto y paciente.", "snippet_before": "Líneas exactas del código original del usuario", "snippet_after": "Versión corregida y nivel Senior", "suggested_code": "null" }\n'
            "]\n\n"
            "EJEMPLO DE SALIDA ESPERADA:\n"
            '[{"line": 12, "title": "Uso de let en constantes", "message": "Usa const en lugar de let.", "explanation": "La inmutabilidad previene errores de reasignación accidental y facilita la lectura.", "snippet_before": "let config = {};", "snippet_after": "const config = {};", "severity": "warning", "suggested_code": null}]\n\n'
            "Usa SIEMPRE variables reales del archivo, NUNCA código genérico (foo/bar). "
            "No incluyas markdown, explicaciones previas ni texto fuera del arreglo JSON. "
            "CRÍTICO: TIENES PROHIBIDO PENSAR EN VOZ ALTA. NO expliques tu razonamiento fuera del JSON."
        )

        original_lines = request.file_content.split('\n')
        # Inyectar números de línea absolutos
        lines = [f"[Line {i+1}] {line}" for i, line in enumerate(original_lines)]

        if len(lines) > 300:
            truncated_content = '\n'.join(lines[:150]) + '\n\n... [CÓDIGO TRUNCADO POR TAMAÑO] ...\n\n' + '\n'.join(lines[-150:])
        else:
            truncated_content = '\n'.join(lines)

        native_errors_text = ""
        if request.native_errors:
            native_errors_text = "ERRORES NATIVOS DE COMPILACIÓN/LINTER REPORTADOS POR EL EDITOR:\n" + "\n".join(request.native_errors) + "\n\n"

        user = (
            f"Analiza este código en {request.language or 'código'}. El cursor del usuario está cerca de la línea {request.cursor_line}:\n\n"
            f"{native_errors_text}"
            f"```\n{truncated_content}\n```\n\n"
            "Devuelve únicamente el arreglo JSON."
        )

        MAX_RETRIES = 2
        for current_model in models_to_try:
            provider = ProviderAdapter.get_provider(current_model)
            api_key = CredentialManager.get_api_key(provider)
            if not api_key:
                last_error = f"API key not configured for {current_model}"
                continue

            adapted = ProviderAdapter.adapt(current_model, api_key)

            model_messages = [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ]

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
                            temperature=0.0,
                            timeout=120,
                            **adapted["kwargs"],
                        ),
                        timeout=125.0
                    )

                    raw_content = str(response.choices[0].message.content or "").strip()
                    raw_clean = _extract_json(raw_content)

                    if not raw_clean:
                        raise ValueError("Empty response from LLM")

                    import json
                    parsed = json.loads(raw_clean)
                    if not isinstance(parsed, list):
                        raise ValueError("Root JSON must be a list")

                    markers = []
                    for item in parsed:
                        if isinstance(item, dict) and "line" in item and "severity" in item and "message" in item and "explanation" in item:
                            markers.append(CodeCoachMarker(
                                line=int(item["line"]),
                                severity=str(item["severity"]),
                                message=str(item["message"]),
                                title=item.get("title"),
                                explanation=str(item["explanation"]),
                                suggested_code=item.get("suggested_code"),
                                snippet_before=item.get("snippet_before"),
                                snippet_after=item.get("snippet_after")
                            ))

                    return markers

                except Exception as e:
                    if attempt < MAX_RETRIES:
                        if raw_content:
                            model_messages.append({"role": "assistant", "content": raw_content})
                        model_messages.append({
                            "role": "user",
                            "content": f"ERROR: {str(e)}. Devuelve JSON puro sin formato extra."
                        })
                        continue
                    else:
                        last_error = f"Error after retries: {str(e)}"
                        break

        raise ValueError(f"All model attempts failed. Last error: {last_error}")

    except Exception as e:
        error_msg = repr(e)
        _logger.error(f"Contextual Mentorship Fallback triggered: {error_msg}")

        return [CodeCoachMarker(
            line=1,
            severity="error",
            message="Fallo del proveedor IA",
            explanation=f"Error_detail: {error_msg}",
            suggested_code=None,
            is_degraded=True
        )]
