import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from litellm import acompletion  # type: ignore

from app.infrastructure.config import DEFAULT_LLM_MODEL
from app.infrastructure.security.credential_manager import CredentialManager

logger = logging.getLogger(__name__)

class LiteLLMGateway:
    def __init__(self, model_name: str | None = None):
        self.model_name = model_name or DEFAULT_LLM_MODEL
        self.cred_manager = CredentialManager()

    def _get_adapted_params(self) -> dict:
        from app.infrastructure.ai.provider_adapter import ProviderAdapter
        provider = ProviderAdapter.get_provider(self.model_name)
        api_key = self.cred_manager.get_api_key(provider)
        return ProviderAdapter.adapt(self.model_name, api_key)

    def _get_tools(self) -> list[dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": "analyze_blast_radius",
                    "description": "Calculates the blast radius of a file in the project's dependency graph. Returns XML detailing dependencies grouped by depth. Very useful when asked what would happen if a file is modified.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "target_file": {
                                "type": "string",
                                "description": "The path to the file to analyze, e.g., 'apps/web/src/UserService.ts'"
                            },
                            "max_depth": {
                                "type": "integer",
                                "description": "Maximum depth of the BFS traversal (default 2)",
                                "default": 2
                            }
                        },
                        "required": ["target_file"]
                    }
                }
            }
        ]

    async def chat_with_graph_rag(
        self,
        project_id: str,
        messages: list[dict[str, Any]],
        analyze_blast_radius_use_case: Any
    ) -> str:
        """
        Executes a ReAct agent loop using LiteLLM to answer architectural questions,
        with access to tools like `analyze_blast_radius`.
        """
        tools = self._get_tools()
        current_messages = list(messages)
        max_tool_iterations = 3

        from uuid import UUID
        proj_uuid = UUID(project_id)

        adapted = self._get_adapted_params()

        for _ in range(max_tool_iterations + 1):
            response = await acompletion(
                model=adapted["model"],
                messages=current_messages,
                tools=tools,
                tool_choice="auto",
                api_key=adapted.get("api_key"),
                **adapted.get("kwargs", {})
            )

            response_message = response.choices[0].message
            current_messages.append(response_message.model_dump(exclude_none=True))

            if response_message.tool_calls:
                for tool_call in response_message.tool_calls:
                    if tool_call.function.name == "analyze_blast_radius":
                        arguments = json.loads(tool_call.function.arguments)
                        target_file = arguments.get("target_file")
                        max_depth = arguments.get("max_depth", 2)

                        logger.info(f"LLM executing analyze_blast_radius for {target_file}")

                        try:
                            # Executing the Use Case
                            tool_result = await analyze_blast_radius_use_case.execute(
                                project_id=proj_uuid,
                                target_file=target_file,
                                max_depth=max_depth
                            )
                        except Exception as e:
                            logger.error(f"Error executing analyze_blast_radius: {e}")
                            tool_result = f"<error>{str(e)}</error>"

                        current_messages.append(
                            {
                                "role": "tool",
                                "name": tool_call.function.name,
                                "tool_call_id": tool_call.id,
                                "content": tool_result,
                            }
                        )
                # Continue the loop
                continue

            # If no tool calls, return the final response
            return response_message.content

        return "Error: Maximum tool iterations reached without finalizing response."

    async def analyze_anomalies_stream(
        self,
        project_name: str,
        project_path: str,
        metrics: dict[str, Any],
        skeletons: dict[str, Any]
    ) -> AsyncGenerator[str, None]:

        _IRON_PROMPT_PREAMBLE = """\
Eres un Principal Software Architect analizando la radiografía de un proyecto (Abstract Syntax Tree + Grafo de Dependencias). Tu objetivo no es listar métricas crudas, sino interpretar el diseño, encontrar deuda técnica real y proponer mejoras accionables.

Tienes prohibido considerar DTOs o Entities con múltiples métodos/getters como 'God Objects'. Un God Object es aquel que importa demasiados dominios externos, no el que tiene muchos métodos internos. Reconoce que las aristas de tipo API_CALL representan comunicación HTTP entre microservicios o Front/Back, no errores de parseo.

Estructura tu reporte ESTRICTAMENTE bajo estos apartados, usando lenguaje técnico avanzado:

# Visión General y Patrones Detectados
Infiere qué arquitectura usan. ¿Es Hexagonal? ¿MVC? ¿Monolito modular? Basándote en nombres de carpetas como 'infrastructure', 'domain', 'features'.

# Deuda Técnica y Cuellos de Botella
Identifica God Objects reales: Controladores que hablan con demasiados repositorios, o Servicios con excesivo fan-out. Identifica código muerto real entre los nodos aislados, ignorando archivos de configuración. Utiliza el formato URI de archivo como `ide://ruta/al/archivo` para citar evidencia.

# Seguridad y Resiliencia (Riesgos Estructurales)
Busca cruces de límites peligrosos. Ej: ¿Hay componentes del frontend saltándose servicios y llamando directamente a APIs no autorizadas? ¿El dominio de Java está importando librerías de infraestructura rompiendo Clean Architecture?

# Plan de Refactorización (Top 3 Acciones)
Da 3 pasos accionables para mejorar la mantenibilidad del código.
"""

        metrics_xml = "<networkx_metrics>\n" + json.dumps(metrics, indent=2) + "\n</networkx_metrics>"
        skeletons_xml = "<code_skeletons>\n" + json.dumps(skeletons, indent=2) + "\n</code_skeletons>"

        prompt = (
            f"{_IRON_PROMPT_PREAMBLE}\n\n"
            f"Ruta del proyecto: {project_path}\n"
            f"Nombre del proyecto: {project_name}\n\n"
            f"{metrics_xml}\n\n"
            f"{skeletons_xml}\n"
        )

        adapted = self._get_adapted_params()

        response_iterator = await acompletion(
            model=adapted["model"],
            messages=[{"role": "user", "content": prompt}],
            stream=True,
            api_key=adapted.get("api_key"),
            **adapted.get("kwargs", {})
        )

        try:
            async for chunk in response_iterator:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except asyncio.CancelledError:
            logger.warning("Conexión abortada por el cliente. Ejecutando guillotina de socket.")
            raise
        finally:
            logger.info("Cerrando iterador de streaming (Guillotina de Socket)")
            if hasattr(response_iterator, "aclose"):
                await response_iterator.aclose()
