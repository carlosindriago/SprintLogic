import difflib
import hashlib
import json
import logging
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import litellm
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.ai.context7_client import Context7Client
from app.infrastructure.ai.provider_adapter import ProviderAdapter
from app.infrastructure.db.database import AsyncSessionLocal
from app.infrastructure.db.models import AIMemoryModel, ContextSnippetModel, ProjectModel
from app.infrastructure.security.credential_manager import CredentialManager


def _parse_dsml_tool_calls(buffer: str) -> list[dict[str, Any]]:
    """
    Parses DeepSeek's raw XML tool calls (DSML) into standard OpenAI tool_call dictionaries.
    Sanitizes DSML tags into standard XML before using ElementTree.
    """
    clean_xml = buffer.replace("<｜｜DSML｜｜tool_calls>", "<tool_calls>") \
                      .replace("</｜｜DSML｜｜tool_calls>", "</tool_calls>") \
                      .replace("<｜｜DSML｜｜invoke", "<invoke") \
                      .replace("</｜｜DSML｜｜invoke>", "</invoke>") \
                      .replace("<｜｜DSML｜｜parameter", "<parameter") \
                      .replace("</｜｜DSML｜｜parameter>", "</parameter>")

    start_idx = clean_xml.find("<tool_calls>")
    end_idx = clean_xml.rfind("</tool_calls>")
    if start_idx != -1 and end_idx != -1:
        clean_xml = clean_xml[start_idx:end_idx + 13]
    else:
        return []

    try:
        root = ET.fromstring(clean_xml)
        tools = []
        for invoke in root.findall('invoke'):
            tool_name = invoke.get('name')
            params = {}
            for param in invoke.findall('parameter'):
                params[param.get('name')] = param.text

            tools.append({
                "id": f"call_dsml_{uuid4().hex[:8]}",
                "type": "function",
                "function": {
                    "name": tool_name,
                    "arguments": json.dumps(params)
                }
            })
        return tools
    except ET.ParseError as e:
        import logging
        logging.getLogger(__name__).warning(f"Error parseando DSML: {e}")
        return []

def _find_all_occurrences(
    content: str,
    needle: str,
    normalize_whitespace: bool = False,
) -> list[tuple[int, int]]:
    """Encuentra todas las ocurrencias de needle en content.
    Si normalize_whitespace=True, colapsa espacios/tabs antes de comparar."""
    if not needle:
        return []

    if normalize_whitespace:

        def _collapse(s: str) -> str:
            return " ".join(s.split())

        search_in = _collapse(content)
        search_for = _collapse(needle)
    else:
        search_in = content
        search_for = needle

    occurrences: list[tuple[int, int]] = []
    start = 0
    while True:
        idx = search_in.find(search_for, start)
        if idx == -1:
            break
        if normalize_whitespace:
            original_start = _map_back(content, idx, len(search_for))
        else:
            original_start = idx
        occurrences.append((original_start, original_start + len(needle)))
        start = idx + 1
    return occurrences


def _map_back(original: str, collapsed_idx: int, needle_len: int) -> int:
    """Mapea un índice del texto colapsado al texto original."""
    collapsed_pos = 0
    for i, ch in enumerate(original):
        if collapsed_pos >= collapsed_idx:
            return i
        if ch not in (" ", "\t", "\n", "\r"):
            collapsed_pos += 1
        elif collapsed_pos > 0 and original[i - 1] not in (" ", "\t", "\n", "\r"):
            collapsed_pos += 1
    return len(original)


def _disambiguate(
    content: str,
    candidates: list[tuple[int, int]],
    context_before: str | None,
    context_after: str | None,
) -> list[tuple[int, int]]:
    """Filtra candidatos que tengan el contexto antes y/o después."""
    result = []
    for start, end in candidates:
        before_ok = True
        after_ok = True
        if context_before:
            before_region = content[max(0, start - 200):start].rstrip("\n")
            before_ok = before_region.endswith(context_before.rstrip("\n"))
        if context_after:
            after_region = content[end:end + 200].lstrip("\n")
            after_ok = after_region.startswith(context_after.lstrip("\n"))
        if before_ok and after_ok:
            result.append((start, end))
    return result


class AIAgent:
    def __init__(self, session: AsyncSession, project_id: UUID | str | None = None):
        self.session = session
        self.project_id: UUID | None = self._coerce_project_id(project_id)
        from app.infrastructure.config import DEFAULT_LLM_MODEL
        self.model = DEFAULT_LLM_MODEL

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
                    "description": "Reads the content of a file within the project. Returns a JSON object with 'content' (first 2000 chars), 'file_hash' (SHA256 — REQUIRED for propose_code_edit), 'file_path', and 'total_length'. Always use this BEFORE calling propose_code_edit to get the exact file content and hash.",
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
            {
                "type": "function",
                "function": {
                    "name": "check_developer_vital_signs",
                    "description": "Lee las métricas de telemetría del desarrollador (Deep Flow, Fricción, Ratio de Oro) para diagnosticar su estado de productividad y detectar bloqueos.",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "propose_code_edit",
                    "description": "Propone una edición quirúrgica a un archivo usando el patrón Search-and-Replace. NUNCA reescribas el archivo entero. Usá read_local_file primero para obtener el contenido exacto y el file_hash. Copiá TEXTUALMENTE el bloque a reemplazar. Si old_code tiene menos de 3 líneas, DEBÉS proporcionar context_before y context_after.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "file_path": {
                                "type": "string",
                                "description": "Ruta relativa al archivo a editar, ej. 'src/components/InsightDashboard.tsx'",
                            },
                            "original_file_hash": {
                                "type": "string",
                                "description": "El SHA256 hash del archivo obtenido de read_local_file. Obligatorio para prevenir corrupción por ediciones concurrentes.",
                            },
                            "old_code": {
                                "type": "string",
                                "description": "El bloque EXACTO de código a reemplazar, copiado textualmente del archivo. Debe incluir la indentación original. Incluí 2-3 líneas extra de contexto alrededor del cambio puntual para garantizar coincidencia única. Si el bloque tiene menos de 3 líneas, DEBÉS proporcionar context_before y context_after.",
                            },
                            "new_code": {
                                "type": "string",
                                "description": "El nuevo código que reemplazará al bloque viejo. Debe mantener la misma indentación que old_code.",
                            },
                            "context_before": {
                                "type": "string",
                                "description": "1-2 líneas ÚNICAS que aparecen INMEDIATAMENTE ANTES del bloque. OBLIGATORIO si old_code tiene menos de 3 líneas o si el bloque puede aparecer múltiples veces.",
                            },
                            "context_after": {
                                "type": "string",
                                "description": "1-2 líneas ÚNICAS que aparecen INMEDIATAMENTE DESPUÉS del bloque. OBLIGATORIO si old_code tiene menos de 3 líneas o si el bloque puede aparecer múltiples veces.",
                            },
                            "description": {
                                "type": "string",
                                "description": "Descripción corta del cambio para el mensaje del diff, ej. 'Cambiar color del botón principal a rojo'",
                            },
                        },
                        "required": ["file_path", "original_file_hash", "old_code", "new_code", "description"],
                    },
                },
            },
        ]

        self._project_root: str | None = None
        self._pending_proposals: list[dict[str, Any]] = []

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

                # Convert for LIKE query instead of MATCH
                sanitized = f"%{query.strip()}%"

                result = await session.execute(
                    text(
                        "SELECT type, name, path, line FROM search_index "
                        "WHERE name LIKE :q OR path LIKE :q OR content LIKE :q LIMIT 20"
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
                    file_hash = hashlib.sha256(content.encode()).hexdigest()
                    truncated = content[:2000] + (
                        "...(truncated)" if len(content) > 2000 else ""
                    )
                    return json.dumps({
                        "content": truncated,
                        "file_hash": file_hash,
                        "file_path": file_path,
                        "total_length": len(content),
                    })
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

            elif name == "check_developer_vital_signs":
                result = await session.execute(
                    text("""
                        SELECT
                            COALESCE(SUM(thinking_ms + coding_ms + testing_ms), 0) as total_ms,
                            COUNT(*) as ping_count,
                            COUNT(CASE WHEN thinking_ms + coding_ms + testing_ms = 0 THEN 1 END) as idle_pings
                        FROM telemetry_pings
                        WHERE timestamp >= datetime('now', '-30 minutes')
                    """)
                )
                row = result.fetchone()
                if not row:
                    return "No hay datos de telemetría disponibles."

                total_ms = row[0] or 0
                ping_count = row[1] or 0
                idle_pings = row[2] or 0
                total_min = round(total_ms / 60000.0, 1)
                deep_flow_hrs = round(total_ms / 3600000.0, 2)
                idle_ratio = round((idle_pings / ping_count * 100), 1) if ping_count > 0 else 0.0

                if ping_count == 0:
                    return "Sin actividad registrada en los últimos 30 minutos."

                status = "productivo"
                if idle_ratio > 60:
                    status = "distraído"
                if total_min < 15 and idle_pings >= 5:
                    status = "bloqueado"

                return json.dumps({
                    "ventana": "30 minutos",
                    "deep_flow_horas": deep_flow_hrs,
                    "actividad_total_minutos": total_min,
                    "pings_inactivos": idle_pings,
                    "ratio_inactividad_pct": idle_ratio,
                    "diagnostico": status,
                })

            elif name == "propose_code_edit":
                file_path = args.get("file_path", "")
                original_file_hash = args.get("original_file_hash", "")
                old_code = args.get("old_code", "")
                new_code = args.get("new_code", "")
                context_before = args.get("context_before")
                context_after = args.get("context_after")
                description = args.get("description", "Sin descripción")

                if not file_path or not old_code or not new_code:
                    return "Error: file_path, old_code y new_code son requeridos."

                old_line_count = len(old_code.strip().split("\n"))
                if old_line_count < 3 and not (context_before or context_after):
                    return (
                        "Error: old_code tiene menos de 3 líneas. "
                        "DEBÉS proporcionar context_before y/o context_after "
                        "para desambiguar el bloque a reemplazar."
                    )

                root = await self._get_project_root()
                if not root:
                    return "Error: No hay proyecto cargado."

                target = Path(file_path)
                if not target.is_absolute():
                    target = Path(root) / file_path
                target = target.resolve()

                if not target.is_relative_to(root):
                    return "Error: Acceso denegado — el archivo está fuera del proyecto."

                try:
                    content = target.read_text(encoding="utf-8", errors="ignore")
                except FileNotFoundError:
                    return f"Error: Archivo no encontrado — {file_path}"
                except Exception as e:
                    return f"Error al leer el archivo: {str(e)}"

                matches = _find_all_occurrences(content, old_code)

                if not matches:
                    stripped_old = old_code.strip()
                    stripped_content = content
                    matches = _find_all_occurrences(
                        stripped_content,
                        stripped_old,
                        normalize_whitespace=True,
                    )
                    if not matches:
                        return (
                            "Error: No se encontró el bloque old_code en el archivo. "
                            "Asegurate de copiarlo EXACTAMENTE como aparece en el archivo, "
                            "incluyendo indentación. Usá read_local_file para verificarlo."
                        )

                if len(matches) > 1:
                    if context_before or context_after:
                        matches = _disambiguate(
                            content, matches, context_before, context_after
                        )
                        if not matches:
                            return (
                                "Error: El bloque aparece múltiples veces y los contextos "
                                "proporcionados no coinciden con ninguna ocurrencia. "
                                "Revisá context_before y context_after."
                            )
                        if len(matches) > 1:
                            return (
                                f"Error: El bloque aparece {len(matches)} veces incluso "
                                "con los contextos dados. Proporcioná más contexto único "
                                "en context_before o context_after."
                            )
                    else:
                        return (
                            f"Error: old_code aparece {len(matches)} veces en el archivo. "
                            "Usá context_before y/o context_after con 1-2 líneas ÚNICAS "
                            "adyacentes al bloque que querés cambiar."
                        )

                match_start, match_end = matches[0]
                new_file_content = content[:match_start] + new_code + content[match_end:]

                diff = "".join(
                    difflib.unified_diff(
                        content.splitlines(keepends=True),
                        new_file_content.splitlines(keepends=True),
                        fromfile=str(file_path),
                        tofile=str(file_path),
                    )
                )

                proposal_id = str(uuid4())
                proposal = {
                    "id": proposal_id,
                    "file_path": file_path,
                    "absolute_path": str(target),
                    "original_file_hash": original_file_hash,
                    "old_code": old_code,
                    "new_code": new_code,
                    "new_file_content": new_file_content,
                    "description": description,
                    "diff": diff,
                }
                _proposals_store[proposal_id] = proposal
                self._pending_proposals.append(proposal)

                return json.dumps(
                    {
                        "status": "propuesta_creada",
                        "proposal_id": proposal_id,
                        "file": file_path,
                        "descripcion": description,
                        "diff": diff,
                    }
                )

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

    async def _build_system_message(self, user_query: str = "") -> str:
        root = await self._get_project_root()
        if not root:
            return ""

        base_prompt = (
            f"Eres SprintLogic AI (El Crisol), el arquitecto de software socrático integrado en el IDE del usuario.\n"
            f"Proyecto alojado en: {root}\n\n"
        )

        try:
            from app.infrastructure.ai.project_scanner import get_project_awareness_xml
            awareness_xml = await get_project_awareness_xml(root)
            if awareness_xml:
                base_prompt += f"{awareness_xml}\n\n"
        except Exception:
            pass

        base_prompt += (
            "=== IRON PROMPT (MANDATO SOCRÁTICO) ===\n"
            "1. NO eres un asistente sumiso. Eres un compañero de debate implacable.\n"
            "2. Exige justificaciones para decisiones arquitectónicas. Obliga al usuario a pensar en Edge Cases.\n"
            "3. Eres el Enforcer de TDD y Docs-as-Code. ANTES de escribir código de producción, "
            "debes exigir o proponer la creación de un TASK-spec usando la herramienta `generate_task_spec`.\n"
            "4. Si el usuario toma una decisión estructural importante, usa `generate_adr` para proponer un registro.\n"
            "5. NO devuelvas bloques de texto gigantes con Markdown de tareas. Usa SIEMPRE las herramientas `generate_task_spec` "
            "y `generate_adr` para proponer borradores que el usuario revisará en su editor interactivo.\n"
            "6. Si usas herramientas de lectura y no hay resultados, busca alternativas. NUNCA digas 'No memories found'."
        )

        # Pipeline Telescópico - Inyectar Developer RAG
        if user_query:
            try:
                import litellm

                from app.infrastructure.security.credential_manager import CredentialManager
                api_key = CredentialManager.get_api_key("gemini")
                if api_key:
                    embed_resp = await litellm.aembedding(
                        model="gemini/text-embedding-004",
                        input=[user_query],
                        api_key=api_key
                    )
                    query_vector = embed_resp.data[0]["embedding"]

                    import numpy as np
                    from sqlalchemy.future import select

                    from app.infrastructure.db.models import DeveloperInsightModel

                    try:
                        async with AsyncSessionLocal() as insight_session:
                            result = await insight_session.execute(select(DeveloperInsightModel))
                            all_insights = result.scalars().all()

                            insight = None
                            if all_insights:
                                q_vec = np.array(query_vector, dtype=np.float32)
                                db_matrix = np.vstack([
                                    np.frombuffer(i.embedding_blob, dtype=np.float32)
                                    for i in all_insights
                                ])
                                similarities = np.dot(db_matrix, q_vec)
                                best_index = np.argmax(similarities)
                                best_score = similarities[best_index]

                                if best_score > 0.75:
                                    insight_obj = all_insights[best_index]
                                    insight = {
                                        "sintoma": insight_obj.sintoma,
                                        "solucion": insight_obj.solucion
                                    }
                    except Exception:
                        insight = None
                    if insight:
                        base_prompt += (
                            f"\n\n<SENSEI_MEMORY>\n"
                            f"[Recuerdo Histórico del Desarrollador]\n"
                            f"Síntoma/Problema: {insight['sintoma']}\n"
                            f"Solución/Lección: {insight['solucion']}\n"
                            f"</SENSEI_MEMORY>"
                        )
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Error fetching insight memory: {e}")

        return base_prompt

    def _get_provider(self, model: str) -> str:
        return ProviderAdapter.get_provider(model)

    async def _prune_messages(
        self,
        messages: list[dict[str, Any]],
        model: str,
        api_key: str | None,
    ) -> list[dict[str, Any]]:
        """Memory pruning: summarizer for >15 messages, sliding window fallback.

        Conserva el system prompt original + los últimos 3 mensajes crudos.
        Los mensajes intermedios se comprimen en un resumen vía el mismo LLM.
        Si el summarizer falla, aplica sliding window de 20 mensajes.
        """
        THRESHOLD = 15
        KEEP_LAST = 3
        MAX_FALLBACK = 20

        if len(messages) <= THRESHOLD:
            return messages

        system_msg = messages[0] if messages[0].get("role") == "system" else None
        start = 1 if system_msg else 0
        to_summarize = messages[start:-KEEP_LAST]
        recent = messages[-KEEP_LAST:]

        try:
            summary_input = "\n".join(
                f"[{m.get('role', '?')}]: {str(m.get('content', ''))[:400]}"
                for m in to_summarize
            )

            response = await litellm.acompletion(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": (
                            "Resumí esta conversación técnica en 3-5 viñetas concisas. "
                            "Capturá decisiones, reglas de negocio y contexto técnico relevante. "
                            "Respondé SOLO con las viñetas, sin introducción.\n\n"
                            f"{summary_input}"
                        ),
                    }
                ],
                api_key=api_key,
                max_tokens=250,
            )
            summary = response.choices[0].message.content
            if not summary:
                raise ValueError("Empty summary")

            rebuilt: list[dict[str, Any]] = []
            if system_msg:
                rebuilt.append(system_msg)
            rebuilt.append(
                {"role": "system", "content": f"[RESUMEN DE CONVERSACIÓN PREVIA]\n{summary}"}
            )
            rebuilt.extend(recent)
            return rebuilt

        except Exception:
            import logging

            _logger = logging.getLogger(__name__)
            _logger.debug("Summarizer failed, falling back to sliding window")

            if len(messages) <= MAX_FALLBACK:
                return messages
            if system_msg:
                return [system_msg] + messages[-(MAX_FALLBACK - 1):]
            return messages[-MAX_FALLBACK:]

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

            user_query = ""
            for m in reversed(messages):
                if m.get("role") == "user":
                    user_query = str(m.get("content", ""))
                    break

            system_msg = await self._build_system_message(user_query)
            if system_msg:
                existing_system = next((m.get("content", "") for m in messages if m.get("role") == "system"), "")
                # We append existing system context (e.g. EDITOR_CONTEXT from sync.py) to our built prompt
                if existing_system:
                    # Quick heuristic to avoid duplicating the base prompt if it was already injected
                    if "=== IRON PROMPT" in existing_system:
                        # Extract just the EDITOR_CONTEXT
                        import re
                        match = re.search(r"<EDITOR_CONTEXT>.*?</EDITOR_CONTEXT>", existing_system, re.DOTALL)
                        if match:
                            system_msg += f"\n\n{match.group(0)}"
                    else:
                        system_msg += f"\n\n{existing_system}"

                messages = [{"role": "system", "content": system_msg}] + [
                    m for m in messages if m.get("role") != "system"
                ]

            adapted = ProviderAdapter.adapt(model, api_key)

            yield json.dumps({"type": "agent_state", "status": "Analizando contexto..."})

            if len(messages) > 15:
                yield json.dumps(
                    {"type": "agent_state", "status": "Comprimiendo memoria a largo plazo..."}
                )

            messages = await self._prune_messages(messages, adapted["model"], adapted["api_key"])

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

                # DSML Interceptor State
                yield_buffer = ""
                xml_accumulator = ""
                is_intercepting_tool = False
                trigger_prefixes = ["<｜｜DSML", "<tool_calls>", "<invoke>"]

                async for chunk in response:
                    delta = chunk.choices[0].delta

                    if getattr(delta, "tool_calls", None):
                        # Standard OpenAI/LiteLLM tool calls
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
                    elif delta.content:
                        text_chunk = delta.content
                        full_content += text_chunk

                        if is_intercepting_tool:
                            xml_accumulator += text_chunk
                            # We are intercepting. Check if we hit the end tag.
                            if "</｜｜DSML｜｜tool_calls>" in xml_accumulator or "</tool_calls>" in xml_accumulator or "</invoke>" in xml_accumulator:
                                parsed_tools = _parse_dsml_tool_calls(xml_accumulator)
                                tool_calls_accum.extend(parsed_tools)

                                # Reset interceptor for the rest of the stream (if any)
                                is_intercepting_tool = False
                                xml_accumulator = ""
                            continue

                        yield_buffer += text_chunk

                        is_potential_tool = False

                        # Check if yield_buffer contains any full prefix or a partial suffix (lookahead)
                        for prefix in trigger_prefixes:
                            if prefix in yield_buffer:
                                is_potential_tool = True
                                is_intercepting_tool = True
                                # Extract the matched part and onwards into xml_accumulator
                                idx = yield_buffer.find(prefix)
                                xml_accumulator = yield_buffer[idx:]
                                # Everything before the tag is safe to yield
                                safe_text = yield_buffer[:idx]
                                if safe_text:
                                    yield json.dumps({"type": "message_chunk", "text": safe_text})

                                yield_buffer = ""
                                yield json.dumps({"type": "agent_state", "status": "Preparando herramientas..."})
                                break

                            # Check for partial suffix match (lookahead)
                            # Only check prefixes up to length-1 since full match is caught above
                            for i in range(1, len(prefix)):
                                if yield_buffer.endswith(prefix[:i]):
                                    is_potential_tool = True
                                    break

                            if is_potential_tool:
                                break

                        if not is_potential_tool and yield_buffer:
                            # Safe to yield
                            yield json.dumps({"type": "message_chunk", "text": yield_buffer})
                            yield_buffer = ""

                # Flush the yield buffer at the end of the stream
                if yield_buffer and not is_intercepting_tool:
                    yield json.dumps({"type": "message_chunk", "text": yield_buffer})

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

                # Emit pending code proposals as SSE events
                for proposal in self._pending_proposals:
                    yield json.dumps(
                        {
                            "type": "code_proposal",
                            "id": proposal["id"],
                            "file_path": proposal["file_path"],
                            "description": proposal["description"],
                            "diff": proposal["diff"],
                        }
                    )
                self._pending_proposals.clear()

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


_proposals_store: dict[str, dict[str, Any]] = {}
