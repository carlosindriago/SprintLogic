import json
import logging
from pathlib import Path
from typing import Any
from uuid import UUID

import litellm
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

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
                stmt = select(ContextSnippetModel).where(
                    ContextSnippetModel.content.icontains(query)
                )
                if self.project_id:
                    stmt = stmt.where(ContextSnippetModel.project_id == self.project_id)
                result = await session.execute(stmt)
                snippets = result.scalars().all()
                if not snippets:
                    return "No context found."
                return json.dumps([{"type": s.type, "content": s.content} for s in snippets])

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
            f"Eres SprintLogic AI, el arquitecto de software integrado en el IDE del usuario. "
            f"NO ERES UN ASISTENTE WEB GENÉRICO. "
            f"El usuario está trabajando en el proyecto alojado localmente en {root}. "
            f"Tienes capacidad de leer archivos y buscar en el proyecto a través de las herramientas proporcionadas. "
            f"REGLAS DE COMPORTAMIENTO ESTRICTAS:\n"
            f"REGLA 1: Si consultas la memoria del proyecto (mem_search) y está vacía "
            f"('No memories found'), NO le digas eso al usuario. En su lugar, usa inmediatamente "
            f"search_codebase o read_local_file para analizar archivos clave "
            f"(package.json, Cargo.toml, pyproject.toml, main.py, index.ts, etc.) y deducir "
            f"la respuesta por ti mismo.\n"
            f"REGLA 2: Cuando el usuario use el comando /architecture, tu obligación es usar "
            f"tus herramientas para escanear la estructura del proyecto (search_codebase) y "
            f"leer archivos de configuración clave (read_local_file), y generar un documento "
            f"arquitectónico detallado basado en tus hallazgos reales.\n"
            f"REGLA 3: NUNCA muestres al usuario resultados crudos de herramientas como "
            f"'No memories found' o 'No context found'. Siempre reformula los resultados "
            f"en una respuesta útil y accionable, usando los datos que SÍ encontraste.\n"
            f"REGLA 4: Si una herramienta falla, intenta otra aproximación. No te rindas "
            f"sin haber intentado al menos search_codebase y read_local_file."
        )

    def _get_provider(self, model: str) -> str:
        model_lower = model.lower()
        if "gemini" in model_lower:
            return "gemini"
        elif "claude" in model_lower or "anthropic" in model_lower:
            return "anthropic"
        elif "gpt" in model_lower or "openai" in model_lower:
            return "openai"
        elif "openrouter" in model_lower:
            return "openrouter"
        elif "nvidia" in model_lower or "nim" in model_lower:
            return "nvidia"
        return "gemini"

    async def chat(
        self, messages: list[dict[str, str]], model: str = "gemini/gemini-1.5-pro-latest"
    ) -> str:
        """
        Processes a chat conversation and allows the AI to call tools before returning a final response.
        """
        try:
            provider = self._get_provider(model)
            api_key = CredentialManager.get_api_key(provider)

            if not api_key and provider != "openrouter" and "ollama" not in model.lower():
                raise ValueError(f"API Key for {provider} not configured.")

            # Inject project context as system message
            system_msg = await self._build_system_message()
            if system_msg:
                messages = [{"role": "system", "content": system_msg}] + [
                    m for m in messages if m.get("role") != "system"
                ]

            import os

            if provider == "nvidia" and api_key:
                os.environ["NVIDIA_NIM_API_KEY"] = api_key

            # Prepare LiteLLM call
            response = await litellm.acompletion(
                model=model, messages=messages, tools=self.tools, api_key=api_key
            )

            if not response.choices or len(response.choices) == 0:
                return "Error: No response from LLM."

            message = response.choices[0].message

            # If model wants to call tools
            if getattr(message, "tool_calls", None):
                messages.append(message.model_dump())

                for tool_call in message.tool_calls:
                    tool_response_str = await self._handle_tool_call(tool_call)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": tool_call.function.name,
                            "content": tool_response_str,
                        }
                    )

                second_response = await litellm.acompletion(
                    model=model, messages=messages, api_key=api_key
                )

                if second_response.choices and len(second_response.choices) > 0:
                    content = getattr(second_response.choices[0].message, "content", "")
                    if content:
                        return str(content)

                # Fallback: retry without tools when second call returns empty
                try:
                    fallback = await litellm.acompletion(
                        model=model,
                        messages=messages,
                        api_key=api_key,
                    )
                    if fallback.choices and len(fallback.choices) > 0:
                        content = getattr(fallback.choices[0].message, "content", "")
                        if content:
                            return str(content)
                except Exception:
                    pass

                return (
                    "Analicé el código solicitado usando las herramientas disponibles. "
                    "Los resultados fueron procesados pero el modelo no pudo generar "
                    "una respuesta final estructurada. Por favor, intentá una consulta "
                    "más específica o preguntá sobre un archivo en particular."
                )

            return str(getattr(message, "content", "") or "")

        except Exception:
            _logger = logging.getLogger(__name__)
            _logger.exception("AI agent execution failed")
            raise

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
