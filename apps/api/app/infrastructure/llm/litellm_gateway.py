import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from litellm import acompletion  # type: ignore

logger = logging.getLogger(__name__)

class LiteLLMGateway:
    def __init__(self, model_name: str = "gpt-4o"):
        self.model_name = model_name

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

        response_iterator = await acompletion(
            model=self.model_name,
            messages=[{"role": "user", "content": prompt}],
            stream=True
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
