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

    async def generate_completion(self, prompt: str, lang_code: str = "en", fallbacks: list[str] | None = None) -> str:
        prompt += self._build_language_clause(lang_code)
        adapted = self._get_adapted_params()

        fallback_params = []
        if fallbacks:
            from app.infrastructure.ai.provider_adapter import ProviderAdapter
            for fb_model in fallbacks:
                fb_provider = ProviderAdapter.get_provider(fb_model)
                fb_api_key = self.cred_manager.get_api_key(fb_provider)
                if fb_api_key:
                    fb_adapted = ProviderAdapter.adapt(fb_model, fb_api_key)
                    fallback_params.append({
                        "model": fb_adapted["model"],
                        "api_key": fb_adapted.get("api_key")
                    })

        response = await acompletion(
            model=adapted["model"],
            messages=[{"role": "user", "content": prompt}],
            api_key=adapted.get("api_key"),
            fallbacks=fallback_params if fallback_params else None,
            num_retries=0,
            timeout=45,
            **adapted.get("kwargs", {}),
        )
        return response.choices[0].message.content or ""


    def _build_language_clause(self, lang_code: str) -> str:
        if lang_code == "es":
            return "\n\nIMPORTANT: Please write your entire response in Spanish."
        elif lang_code == "pt":
            return "\n\nIMPORTANT: Please write your entire response in Portuguese."
        return ""

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
        skeletons: dict[str, Any],
        project_context_xml: str = "",
        lang_code: str = "en"
    ) -> AsyncGenerator[str, None]:

        from app.infrastructure.db.database import get_sessionmaker
        from app.infrastructure.repositories import prompt_repository

        sessionmaker = get_sessionmaker()
        async with sessionmaker() as session:
            golden_prompt = await prompt_repository.get_prompt_async(session, "architect_report_v5")

        prompt_content = golden_prompt.content if golden_prompt else "Fallback"

        metrics_copy = dict(metrics)
        for k in ["dependencies", "isolated_components", "edge_count", "in_degree"]:
            metrics_copy.pop(k, None)

        metrics_xml = "<networkx_metrics>\n" + json.dumps(metrics_copy, indent=2) + "\n</networkx_metrics>"
        skeletons_xml = "<code_skeletons>\n" + json.dumps(skeletons, indent=2) + "\n</code_skeletons>"

        prompt = prompt_content.format(
            project_path=project_path,
            project_name=project_name,
            project_context_xml=project_context_xml,
            metrics_xml=metrics_xml,
            skeletons_xml=skeletons_xml
        )

        prompt += self._build_language_clause(lang_code)

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

    async def extract_kanban_tickets_phantom(self, report_text: str, extractor_model: str, lang_code: str = "en") -> list[dict[str, Any]]:
        import json

        from litellm import acompletion

        from app.infrastructure.db.database import get_sessionmaker
        from app.infrastructure.repositories import prompt_repository

        sessionmaker = get_sessionmaker()
        async with sessionmaker() as session:
            phantom = await prompt_repository.get_prompt_async(session, "phantom_extractor")

        if not phantom:
            prompt = (
                "Extract actionable Kanban tickets from the report below.\n\n"
                f"Report:\n{report_text}\n\n"
                "Respond strictly in JSON format matching exactly this schema: "
                "{\"tickets\": [{\"title\": \"...\", \"description\": \"...\"}]}"
            )
        else:
            prompt = phantom.content.format(report_text=report_text)

        prompt += self._build_language_clause(lang_code)

        try:
            from app.infrastructure.ai.provider_adapter import ProviderAdapter
            provider = ProviderAdapter.get_provider(extractor_model)
            api_key = self.cred_manager.get_api_key(provider)
            adapted = ProviderAdapter.adapt(extractor_model, api_key)

            response = await acompletion(
                model=adapted["model"],
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                api_key=adapted.get("api_key"),
                **adapted.get("kwargs", {})
            )
            content = response.choices[0].message.content
            data = json.loads(content)
            return data.get("tickets", [])
        except Exception as e:
            logger.error(f"Phantom Extractor failed: {e}")
            return []
