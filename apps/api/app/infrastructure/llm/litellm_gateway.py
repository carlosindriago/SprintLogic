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
CONTEXTO DE DOMINIO (LEER ANTES DE ANALIZAR):
Estás analizando el grafo de dependencias de un proyecto.

Regla de Física #1: El backend en Python frecuentemente lee (File I/O) archivos del frontend (.css, .tsx, .ts) para analizarlos.
Regla de Física #2: Leer un archivo NO es importarlo. Python no puede importar CSS o React. Si ves una conexión entre el backend y el frontend, ASUME por defecto que es una operación de lectura/escaneo, NO una violación de dependencias cruzadas.

MARCO DE EVIDENCIA ESTRICTO:
Tu trabajo es identificar vulnerabilidades arquitectónicas, pero estás sujeto a un rigor científico absoluto. Sigue estas reglas al emitir tu reporte:

- Cero Suposiciones: No deduzcas intenciones. Si ves un acoplamiento, descríbelo. Si crees que es un "import" entre lenguajes incompatibles, detente y reclasifícalo como operación de I/O.
- Evidencia Requerida: Si vas a reportar un error crítico (como un God Object o una violación de la Arquitectura Limpia), debes citar los nombres exactos de los nodos o módulos que lo prueban. Utiliza el formato URI de archivo como `ide://ruta/al/archivo` para que el IDE local lo pueda abrir.
- Humildad Epistémica: Si el grafo es ambiguo o una conexión no tiene sentido lógico en el lenguaje objetivo, tu respuesta obligatoria debe ser: "El grafo muestra una relación entre X y Y, pero debido a la incompatibilidad de lenguajes, esto probablemente representa una operación de lectura/parseo y no una dependencia de módulo. Se requiere validación manual."
- Lenguaje Categórico: Nunca uses frases como "Me parece que", "Podría ser", "Yo creo". Usa "El grafo indica", "Se observa", o "La evidencia es insuficiente para concluir".
"""

        metrics_xml = "<networkx_metrics>\n" + json.dumps(metrics, indent=2) + "\n</networkx_metrics>"
        skeletons_xml = "<code_skeletons>\n" + json.dumps(skeletons, indent=2) + "\n</code_skeletons>"

        prompt = (
            f"{_IRON_PROMPT_PREAMBLE}\n"
            f"Analiza la estructura de este proyecto de software basándote en su grafo de dependencias de código y estructuras AST extraídas.\n"
            f"Ruta del proyecto: {project_path}\n"
            f"Nombre del proyecto: {project_name}\n\n"
            f"{metrics_xml}\n\n"
            f"{skeletons_xml}\n\n"
            f"Emite un reporte en formato Markdown siguiendo el Marco de Evidencia Estricto."
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
