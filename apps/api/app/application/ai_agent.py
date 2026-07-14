import json
import logging
from pathlib import Path
from typing import Any
from uuid import UUID

import litellm
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.ai.context7_client import Context7Client
from app.infrastructure.ai.provider_adapter import ProviderAdapter
from app.infrastructure.db.database import AsyncSessionLocal
from app.infrastructure.db.models import AIMemoryModel, ContextSnippetModel, ProjectModel
from app.infrastructure.security.credential_manager import CredentialManager


class AIAgent:
    def __init__(self, session: AsyncSession, project_id: UUID | str | None = None):
        self.session = session
        self.project_id: UUID | None = self._coerce_project_id(project_id)
        self.model = "gemini/gemini-2.5-flash"  # Default Gemini model via litellm

        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "mem_save",
                    "description": "Saves a long-term memory summary, decision, or architectural note.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "memory_type": {
                                "type": "string",
                                "description": "e.g., 'decision', 'summary', 'architecture'",
                            },
                            "topic": {
                                "type": "string",
                                "description": "A short, stable key or topic name for this memory",
                            },
                            "content": {
                                "type": "string",
                                "description": "The detailed content to save",
                            },
                        },
                        "required": ["memory_type", "topic", "content"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "mem_search",
                    "description": "Searches past memories based on a keyword.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Keyword to search in memories",
                            }
                        },
                        "required": ["query"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "context_search",
                    "description": "Searches codebase context snippets (like parsed dependencies).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Keyword to search in context snippets",
                            }
                        },
                        "required": ["query"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "search_codebase",
                    "description": "Full-text search across all project files and symbols. Use this to find files, classes, or function definitions by name or keyword.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Search term — file name, symbol name, or keyword",
                            }
                        },
                        "required": ["query"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "read_local_file",
                    "description": "Reads the content of a file within the project. Returns the first 2000 characters.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "file_path": {
                                "type": "string",
                                "description": "Relative or absolute path to the file",
                            }
                        },
                        "required": ["file_path"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "context7_search",
                    "description": "Search official documentation for libraries and frameworks using Context7. Use this for API references, configuration syntax, version-specific features, or library usage patterns.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "The technical query to search in library documentation",
                            }
                        },
                        "required": ["query"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "generate_task_spec",
                    "description": "Propose a new TASK specification draft. Use this to enforce TDD by defining the task before writing code.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "task_id": {
                                "type": "string",
                                "description": "The ID of the task, e.g., 'TASK-402'",
                            },
                            "title": {
                                "type": "string",
                                "description": "The title of the task",
                            },
                            "domain": {
                                "type": "string",
                                "description": "The domain/module of the project this task belongs to",
                            },
                            "context": {
                                "type": "string",
                                "description": "Background context and architectural reasoning",
                            },
                            "requirements": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {"type": "string", "description": "e.g., 'REQ-1'"},
                                        "description": {
                                            "type": "string",
                                            "description": "The detailed technical requirement",
                                        },
                                    },
                                    "required": ["id", "description"],
                                },
                                "description": "List of explicit requirements",
                            },
                        },
                        "required": ["task_id", "title", "domain", "context", "requirements"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "generate_adr",
                    "description": "Propose a new Architecture Decision Record draft. Use this when a structural decision is made.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "adr_id": {
                                "type": "string",
                                "description": "The ADR ID, e.g., 'ADR-001'",
                            },
                            "title": {
                                "type": "string",
                                "description": "Title of the architectural decision",
                            },
                            "context": {
                                "type": "string",
                                "description": "Context and problem statement",
                            },
                            "decision": {
                                "type": "string",
                                "description": "The decision made",
                            },
                            "consequences": {
                                "type": "string",
                                "description": "Positive and negative consequences of the decision",
                            },
                        },
                        "required": ["adr_id", "title", "context", "decision", "consequences"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "explore_architecture",
                    "description": "Explora la arquitectura de SprintLogic buscando código relevante (Topological Pruning).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Consulta semántica (e.g. 'JWT token validation logic')",
                            }
                        },
                        "required": ["query"],
                    },
                },
            },
        ]

        self._project_root: str | None = None

    async def _handle_tool_call(self, tool_call: Any) -> str:
        """Executes a requested tool call and returns a string response."""
        name = tool_call.function.name
        try:
            raw_args = tool_call.function.arguments or "{}"
            args = json.loads(raw_args)
        except (json.JSONDecodeError, AttributeError):
            return "Error: invalid tool arguments."

        # Use a fresh short-lived session for tool calls to avoid
        # holding the DB connection during LLM network I/O.
        async with AsyncSessionLocal() as session:
            if name == "mem_save":
                memory = AIMemoryModel(
                    project_id=self.project_id,
                    memory_type=args.get("memory_type", "unknown"),
                    topic=args.get("topic", "untitled"),
                    content=args.get("content", ""),
                )
                session.add(memory)
                await session.commit()
                return f"Memory '{args.get('topic', 'untitled')}' saved successfully."

            elif name == "mem_search":
                query = args.get("query", "")
                stmt = select(AIMemoryModel).where(AIMemoryModel.content.icontains(query))
                if self.project_id:
                    stmt = stmt.where(AIMemoryModel.project_id == self.project_id)
                result = await session.execute(stmt)
                memories = result.scalars().all()
                if not memories:
                    return "No memories found."
                return json.dumps(
                    [
                        {"topic": m.topic, "content": m.content, "type": m.memory_type}
                        for m in memories
                    ]
                )

            elif name == "context_search":
                query = args.get("query", "")
                snippet_stmt = select(ContextSnippetModel).where(
                    ContextSnippetModel.content.icontains(query)
                )
                if self.project_id:
                    snippet_stmt = snippet_stmt.where(
                        ContextSnippetModel.project_id == self.project_id
                    )
                result = await session.execute(snippet_stmt)
                snippets = result.scalars().all()
                if not snippets:
                    return "No context found."
                return json.dumps(
                    [
                        {
                            "type": s.label if hasattr(s, "label") else "snippet",
                            "content": s.content,
                        }
                        for s in snippets
                    ]
                )

            elif name == "search_codebase":
                query = args.get("query", "").strip()

                if not query or query in ("*", "**"):
                    return (
                        "ToolError: Invalid FTS5 query. Do not use standalone wildcards "
                        "like '*'. Search for specific architectural keywords like 'main', "
                        "'config', 'package.json', 'index', 'docker', 'router', 'component', "
                        "'controller', 'service', or file names."
                    )

                # Sanitize for FTS5 MATCH: escape single quotes, wrap dotted names
                sanitized = query.replace("'", "''")
                if "." in sanitized and not sanitized.startswith('"'):
                    sanitized = f'"{sanitized}"'
                sanitized += "*"

                # Reject queries that are only special FTS5 chars after sanitization
                cleaned = sanitized.replace("*", "").replace('"', "").replace("-", "").strip()
                if not cleaned or not any(c.isalnum() for c in cleaned):
                    return (
                        "ToolError: Query contains only special characters. "
                        "Search for meaningful terms like 'main', 'App', 'config', 'router'."
                    )

                result = await session.execute(
                    text(
                        "SELECT type, name, path, line FROM search_index "
                        "WHERE search_index MATCH :q ORDER BY rank LIMIT 20"
                    ),
                    {"q": sanitized},
                )
                rows = result.fetchall()
                if not rows:
                    return "No results found in codebase."
                return json.dumps(
                    [{"type": r[0], "name": r[1], "path": r[2], "line": r[3]} for r in rows]
                )

            elif name == "read_local_file":
                file_path = args.get("file_path", "")
                root = await self._get_project_root()
                if not root:
                    return "Error: No project context available."

                target = Path(file_path)
                if not target.is_absolute():
                    target = Path(root) / file_path
                target = target.resolve()

                if not target.is_relative_to(root):
                    return "Error: Access denied — file is outside the project."

                try:
                    content = target.read_text(encoding="utf-8", errors="ignore")
                    return content[:2000] + ("...(truncated)" if len(content) > 2000 else "")
                except FileNotFoundError:
                    return f"Error: File not found — {file_path}"
                except Exception as e:
                    return f"Error reading file: {str(e)}"

            elif name == "context7_search":
                query = args.get("query", "")
                api_key = CredentialManager.get_api_key("context7")
                if not api_key:
                    return "Error: Context7 API key not configured."
                docs = await Context7Client.search(query, api_key)
                return docs if docs else "No documentation found for that query."

            elif name == "generate_task_spec":
                payload = {
                    "action": "propose_draft",
                    "filepath": f".sprintlogic/specs/{args.get('task_id', 'TASK-000')}.md",
                    "type": "task",
                    "content": args,
                    "tool_call_id": tool_call.id,
                }
                return f"__DRAFT_PROPOSAL__:{json.dumps(payload)}"

            elif name == "generate_adr":
                payload = {
                    "action": "propose_draft",
                    "filepath": f"docs/adr/{args.get('adr_id', 'ADR-000')}.md",
                    "type": "adr",
                    "content": args,
                    "tool_call_id": tool_call.id,
                }
                return f"__DRAFT_PROPOSAL__:{json.dumps(payload)}"
            elif name == "explore_architecture":
                query = args.get("query", "")

                # Mock integration for ONNX/SQLite-Vec (since we don't have the actual ONNX pipeline wired here)
                # In a real implementation, we would call the search service here.
                # Here we just simulate retrieving context for the query.
                return f"<contexto_ast>\n<ecosistema>\n# Ecosystem for {query}\n</ecosistema>\n<firmas_hermanas>\n# Firmas\n</firmas_hermanas>\n<codigo_objetivo>\n# Target code\n</codigo_objetivo>\n</contexto_ast>"

        return "Unknown tool."

    async def _get_project_root(self) -> str | None:
        """Fetches and caches the project root path. Uses self.session
        only on first call (from _build_system_message before LLM call)."""
        if self._project_root is not None:
            return self._project_root or None
        if not self.project_id:
            self._project_root = ""
            return None
        try:
            project_uuid = (
                self.project_id if isinstance(self.project_id, UUID) else UUID(str(self.project_id))
            )
        except (ValueError, TypeError):
            self._project_root = ""
            return None
        stmt = select(ProjectModel).where(ProjectModel.id == project_uuid)
        result = await self.session.execute(stmt)
        project = result.scalar_one_or_none()
        if project and project.path:
            self._project_root = str(Path(project.path).resolve())
            return self._project_root
        self._project_root = ""
        return None

    async def _build_system_message(self) -> str:
        root = await self._get_project_root()
        if not root:
            return ""
        return (
            f"Eres SprintLogic AI (El Crisol), el arquitecto de software socrático integrado en el IDE del usuario.\n"
            f"Proyecto alojado en: {root}\n\n"
            f"=== IRON PROMPT (MANDATO SOCRÁTICO) ===\n"
            f"1. NO eres un asistente sumiso. Eres un compañero de debate implacable.\n"
            f"2. Exige justificaciones para decisiones arquitectónicas. Obliga al usuario a pensar en Edge Cases.\n"
            f"3. Eres el Enforcer de TDD y Docs-as-Code. ANTES de escribir código de producción, "
            f"debes exigir o proponer la creación de un TASK-spec usando la herramienta `generate_task_spec`.\n"
            f"4. Si el usuario toma una decisión estructural importante, usa `generate_adr` para proponer un registro.\n"
            f"5. NO devuelvas bloques de texto gigantes con Markdown de tareas. Usa SIEMPRE las herramientas `generate_task_spec` "
            f"y `generate_adr` para proponer borradores que el usuario revisará en su editor interactivo.\n"
            f"6. Si usas herramientas de lectura y no hay resultados, busca alternativas. NUNCA digas 'No memories found'."
        )

    def _get_provider(self, model: str) -> str:
        return ProviderAdapter.get_provider(model)

    async def chat_stream(self, messages: list[dict[str, Any]], model: str):
        """
        Processes a chat conversation via streaming, yielding SSE strings for transparency.
        Includes an Agent Loop Governor (Max 3 steps, Intent Caching).
        """
        try:
            provider = self._get_provider(model)
            api_key = CredentialManager.get_api_key(provider)

            if not api_key and provider != "openrouter" and "ollama" not in model.lower():
                yield json.dumps(
                    {"type": "error", "message": f"API Key for {provider} not configured."}
                )
                return

            system_msg = await self._build_system_message()
            if system_msg:
                messages = [{"role": "system", "content": system_msg}] + [
                    m for m in messages if m.get("role") != "system"
                ]

            adapted = ProviderAdapter.adapt(model, api_key)

            yield json.dumps({"type": "agent_state", "status": "Pensando..."})

            MAX_TOOL_CALLS = 3
            tool_calls_count = 0
            intent_cache = set()

            while tool_calls_count < MAX_TOOL_CALLS:
                response = await litellm.acompletion(
                    model=adapted["model"],
                    messages=messages,
                    tools=self.tools,
                    api_key=adapted["api_key"],
                    stream=True,
                    **adapted["kwargs"],
                )

                full_content = ""
                tool_calls_accum: list[dict[str, Any]] = []

                async for chunk in response:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        full_content += delta.content
                        yield json.dumps({"type": "message_chunk", "text": delta.content})

                    if getattr(delta, "tool_calls", None):
                        if not tool_calls_accum:
                            yield json.dumps(
                                {"type": "agent_state", "status": "Preparando herramientas..."}
                            )

                        for tc in delta.tool_calls:
                            # Reconstruct tool calls from stream chunks
                            while len(tool_calls_accum) <= tc.index:
                                tool_calls_accum.append(
                                    {
                                        "id": "",
                                        "type": "function",
                                        "function": {"name": "", "arguments": ""},
                                    }
                                )

                            if tc.id:
                                tool_calls_accum[tc.index]["id"] += tc.id
                            if tc.function.name:
                                tool_calls_accum[tc.index]["function"]["name"] += tc.function.name
                            if tc.function.arguments:
                                tool_calls_accum[tc.index]["function"]["arguments"] += (
                                    tc.function.arguments
                                )

                if not tool_calls_accum:
                    # No more tools, we are done
                    break

                # We have tools to execute
                tool_calls_count += 1
                messages.append(
                    {"role": "assistant", "content": full_content, "tool_calls": tool_calls_accum}
                )

                for tc in tool_calls_accum:
                    func_name = tc["function"]["name"]
                    func_args_str = tc["function"]["arguments"]

                    yield json.dumps(
                        {"type": "tool_call", "tool": func_name, "query": func_args_str}
                    )

                    # Intent cache check
                    intent_key = f"{func_name}:{func_args_str}"
                    if intent_key in intent_cache:
                        tool_response_str = "Error: Ya has buscado esto. Usa la información que ya tienes o cambia tu enfoque."
                    else:
                        intent_cache.add(intent_key)

                        # Use a mock object to match LiteLLM structure expected by _handle_tool_call
                        class MockToolCall:
                            def __init__(self, t):
                                self.id = t["id"]

                                class Func:
                                    name = t["function"]["name"]
                                    arguments = t["function"]["arguments"]

                                self.function = Func()

                        tool_response_str = await self._handle_tool_call(MockToolCall(tc))

                    yield json.dumps(
                        {"type": "tool_result", "status": f"Contexto de {func_name} inyectado."}
                    )

                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "name": func_name,
                            "content": tool_response_str,
                        }
                    )

                if tool_calls_count >= MAX_TOOL_CALLS:
                    # Circuit breaker triggered
                    messages.append(
                        {
                            "role": "system",
                            "content": "Límite de exploración alcanzado. Responde al usuario basándote estrictamente en el contexto XML proporcionado hasta ahora.",
                        }
                    )
                    # Loop will terminate on next check, but we need one last completion
                    fallback = await litellm.acompletion(
                        model=adapted["model"],
                        messages=messages,
                        api_key=adapted["api_key"],
                        stream=True,
                        **adapted["kwargs"],
                    )
                    async for chunk in fallback:
                        delta = chunk.choices[0].delta
                        if delta.content:
                            yield json.dumps({"type": "message_chunk", "text": delta.content})
                    break

        except Exception as e:
            _logger = logging.getLogger(__name__)
            _logger.exception("AI agent execution failed")
            yield json.dumps(
                {"type": "error", "message": f"Falla catastrófica en el núcleo: {str(e)}"}
            )

    @staticmethod
    def _coerce_project_id(value: UUID | str | None) -> UUID | None:
        """Coerce incoming project_id to a validated UUID or None.

        Accepts UUID, str (parsed), or None. Raises ValueError on a malformed
        string so callers fail fast with a clear 400 instead of an opaque
        IntegrityError from the FK constraint.
        """
        if value is None:
            return None
        if isinstance(value, UUID):
            return value
        if isinstance(value, str):
            try:
                return UUID(value)
            except (ValueError, TypeError) as exc:
                raise ValueError(
                    f"AIAgent.project_id must be a valid UUID string, got: {value!r}"
                ) from exc
        raise TypeError(
            f"AIAgent.project_id must be UUID, str, or None; got {type(value).__name__}"
        )
