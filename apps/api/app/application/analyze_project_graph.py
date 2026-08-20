"""
Use Case: Analyze Project Graph

Orchestrates graph extraction, context building, LLM streaming, and report persistence.
Each private function has exactly one responsibility.
"""

import asyncio
import json
import logging
import os
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.graph_metrics import _compute_graph_metrics_cpu_bound
from app.infrastructure.db.database import get_sessionmaker
from app.infrastructure.db.models import AnalysisReportModel
from app.infrastructure.llm.litellm_gateway import LiteLLMGateway
from app.infrastructure.repositories.graph_repository import SQLAlchemyGraphRepository
from app.infrastructure.repositories.tool_model_repository import (
    resolve_tool_model,
    tool_model_label,
)

logger = logging.getLogger(__name__)

_MAX_KEY_FILE_LINES = 300
_TOP_GOD_OBJECTS = 5
_TOP_KEY_NODES = 2


# ─────────────────────────────────────────────────────────────────────────────
# Private: Graph-level helpers
# ─────────────────────────────────────────────────────────────────────────────


def _build_file_level_graph(
    filtered_nodes: list,
    filtered_edges: list,
) -> tuple[dict[str, dict], list[dict[str, str]]]:
    """
    Collapses the AST-node graph into a file-level graph.

    Returns:
        file_nodes_dict: abs_path → file node dict
        nx_edges: deduplicated list of {source, target, type} at file level
    """
    node_file_paths: dict[str, str] = {n.id: os.path.abspath(n.file_path) for n in filtered_nodes}

    file_nodes_dict: dict[str, dict] = {}
    for n in filtered_nodes:
        if not n.file_path:
            continue
        abs_path = os.path.abspath(n.file_path)
        if abs_path not in file_nodes_dict:
            file_nodes_dict[abs_path] = {
                "id": abs_path,
                "label": os.path.basename(abs_path),
                "is_test": abs_path.endswith(".spec.ts") or abs_path.endswith("Test.java"),
                "file_path": abs_path,
            }

    pruned_edges = [
        e
        for e in filtered_edges
        if node_file_paths.get(e.source_id) != node_file_paths.get(e.target_id)
    ]

    seen: set[tuple[str, str]] = set()
    nx_edges: list[dict[str, str]] = []
    for e in pruned_edges:
        src = node_file_paths.get(e.source_id)
        tgt = node_file_paths.get(e.target_id)
        if src and tgt and src != tgt and (src, tgt) not in seen:
            seen.add((src, tgt))
            nx_edges.append(
                {
                    "source": src,
                    "target": tgt,
                    "type": e.type.value if hasattr(e.type, "value") else str(e.type),
                }
            )

    return file_nodes_dict, nx_edges


# ─────────────────────────────────────────────────────────────────────────────
# Private: Directory tree helpers
# ─────────────────────────────────────────────────────────────────────────────


class _DirNode:
    """Lightweight trie node for directory path decomposition."""

    __slots__ = ("children",)

    def __init__(self) -> None:
        self.children: dict[str, _DirNode] = {}


def _collapse_single_child_nodes(node: _DirNode, current_name: str = "") -> tuple[str, _DirNode]:
    """
    Collapses chains of single-child directories into a single path segment
    (similar to how GitHub renders e.g. 'src/main/java/...' collapsed).
    """
    while len(node.children) == 1:
        child_name, child_node = next(iter(node.children.items()))
        current_name = f"{current_name}/{child_name}" if current_name else child_name
        node = child_node

    collapsed = _DirNode()
    for child_name, child_node in node.children.items():
        res_name, res_node = _collapse_single_child_nodes(child_node, child_name)
        collapsed.children[res_name] = res_node

    return current_name, collapsed


def _format_tree_lines(
    node: _DirNode, prefix: str = "", depth: int = 1, max_depth: int = 3
) -> list[str]:
    """Renders a directory trie as indented text lines."""
    if depth > max_depth:
        return []
    lines: list[str] = []
    for child_name, child_node in sorted(node.children.items()):
        lines.append(f"{prefix}- {child_name}/")
        lines.extend(_format_tree_lines(child_node, prefix + "  ", depth + 1, max_depth))
    return lines


def _build_dir_structure(all_file_paths: set[str], project_path: str) -> str:
    """
    Builds a collapsed, human-readable directory tree from a set of absolute paths.
    Excludes the file name component (only directories are shown).
    """
    root = _DirNode()
    for path in all_file_paths:
        rel = os.path.relpath(path, project_path)
        parts = rel.split(os.sep)[:-1]  # strip filename
        current = root
        for part in parts:
            if part not in current.children:
                current.children[part] = _DirNode()
            current = current.children[part]

    _, collapsed_root = _collapse_single_child_nodes(root)
    return "\n".join(_format_tree_lines(collapsed_root))


# ─────────────────────────────────────────────────────────────────────────────
# Private: XML context builders
# ─────────────────────────────────────────────────────────────────────────────


def _build_top_files_xml(metrics: dict) -> str:
    """Serializes god-object metrics (highest fan-in / fan-out) as XML."""

    def _entry(go: dict, direction: str) -> str:
        fpath = go.get("file_path", go.get("node"))
        tipo = "test" if go.get("is_test") else "fuente"
        code_cnt = go.get("code_count", go["count"])
        api_cnt = go.get("api_count", 0)
        dep_tag = f"dependencias_codigo_{direction}"
        api_tag = f"llamadas_api_http_{direction}"
        return (
            f'  <archivo nombre="{fpath}" tipo="{tipo}">\n'
            f"    <{dep_tag}>{code_cnt}</{dep_tag}>\n"
            f"    <{api_tag}>{api_cnt}</{api_tag}>\n"
            f"  </archivo>\n"
        )

    lines = ["<archivos_con_mas_dependencias>\n"]
    for go in metrics.get("god_objects_in", [])[:_TOP_GOD_OBJECTS]:
        lines.append(_entry(go, "entrantes"))
    for go in metrics.get("god_objects_out", [])[:_TOP_GOD_OBJECTS]:
        lines.append(_entry(go, "salientes"))
    lines.append("</archivos_con_mas_dependencias>")
    return "".join(lines)


def _select_key_nodes(
    file_nodes: list[dict],
    nx_edges: list[dict[str, str]],
) -> tuple[list[dict], dict | None]:
    """
    Selects up to 3 structurally significant files:
      - 1 orchestrator  (highest out-degree = highest fan-out)
      - 2 core/domain   (highest in-degree  = highest fan-in)

    Returns (key_nodes, top_out_node).
    """
    in_degrees: dict[str, int] = {}
    out_degrees: dict[str, int] = {}
    for edge in nx_edges:
        out_degrees[edge["source"]] = out_degrees.get(edge["source"], 0) + 1
        in_degrees[edge["target"]] = in_degrees.get(edge["target"], 0) + 1

    top_out_node: dict | None = max(
        file_nodes, key=lambda n: out_degrees.get(n["id"], 0), default=None
    )
    top_in_nodes = sorted(
        [n for n in file_nodes if n is not top_out_node],
        key=lambda n: in_degrees.get(n["id"], 0),
        reverse=True,
    )[:_TOP_KEY_NODES]

    key_nodes = [n for n in [top_out_node, *top_in_nodes] if n is not None]
    return key_nodes, top_out_node


async def _build_key_files_xml(
    key_nodes: list[dict],
    top_out_node: dict | None,
) -> str:
    """
    Reads source code for each key node (capped at 300 lines, FinOps guard)
    and serializes it as XML.
    """
    lines = ["<archivos_clave_dominio>\n"]
    for node in key_nodes:
        file_path = node["file_path"]
        if not file_path or not await asyncio.to_thread(os.path.exists, file_path):
            continue
        try:
            with open(file_path, encoding="utf-8") as fh:
                raw_lines = fh.readlines()
            content = "".join(raw_lines[:_MAX_KEY_FILE_LINES])
            if len(raw_lines) > _MAX_KEY_FILE_LINES:
                content += "\n... [CÓDIGO TRUNCADO PARA PROTEGER CONTEXTO] ..."
            role = (
                "Orquestador/Router (Alto Fan-Out)"
                if node is top_out_node
                else "Core/Dominio (Alto Fan-In)"
            )
            lines.append(
                f'  <archivo rol="{role}" ruta="{file_path}">\n'
                f"    <codigo_fuente>\n{content}\n    </codigo_fuente>\n"
                f"  </archivo>\n"
            )
        except Exception:
            logger.warning("Could not read key file %s", file_path, exc_info=True)

    lines.append("</archivos_clave_dominio>")
    return "".join(lines)


def _build_main_langs_str(all_file_paths: set[str]) -> str:
    """Returns a comma-separated summary of the top 3 file extensions by count."""
    extensions: dict[str, int] = {}
    for path in all_file_paths:
        ext = os.path.splitext(path)[1].lower()
        if ext:
            extensions[ext] = extensions.get(ext, 0) + 1
    top = sorted(extensions.items(), key=lambda x: x[1], reverse=True)[:3]
    return ", ".join(f"{ext} ({count})" for ext, count in top)


def _build_project_context_xml(
    total_files: int,
    main_langs_str: str,
    dir_structure: str,
    top_files_xml: str,
    key_files_xml: str,
) -> str:
    """Assembles the final <contexto_del_proyecto> XML block for the LLM prompt."""
    return (
        "<contexto_del_proyecto>\n"
        "  <estadisticas>\n"
        f"    <archivos_fuente_reales>{total_files}</archivos_fuente_reales>\n"
        f"    <lenguajes_principales>{main_langs_str}</lenguajes_principales>\n"
        "  </estadisticas>\n"
        "  <estructura_directorios>\n"
        f"{dir_structure}\n"
        "  </estructura_directorios>\n"
        f"  {top_files_xml}\n"
        f"  {key_files_xml}\n"
        "</contexto_del_proyecto>"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Private: Persistence helper
# ─────────────────────────────────────────────────────────────────────────────


async def _persist_report(
    project_uuid: object,
    model_id: str,
    content: str,
    metrics: dict,
) -> None:
    """Persists the final analysis report in a fresh session (fire-and-forget safe)."""
    async with get_sessionmaker()() as db_session:
        new_report = AnalysisReportModel(
            id=uuid.uuid4(),
            project_id=project_uuid,
            type="code_analysis",
            content=content,
            ai_model_version=model_id,
            structural_metrics=metrics,
        )
        db_session.add(new_report)
        await db_session.commit()


# ─────────────────────────────────────────────────────────────────────────────
# Use Case
# ─────────────────────────────────────────────────────────────────────────────


class AnalyzeProjectGraphUseCase:
    """
    Streams an LLM analysis of the project's dependency graph to the client,
    then persists the report and extracts Kanban ticket suggestions.

    Responsibilities (each delegated to a private module function):
      - Graph → file-level graph   (_build_file_level_graph)
      - Directory structure string (_build_dir_structure)
      - Metrics computation        (_compute_graph_metrics_cpu_bound via thread)
      - XML context assembly       (_build_top_files_xml, _build_key_files_xml, _build_project_context_xml)
      - LLM streaming              (LiteLLMGateway.analyze_anomalies_stream)
      - Report persistence         (_persist_report)
    """

    def __init__(
        self,
        session: AsyncSession,
        project: object,
        lang_code: str = "en",
    ) -> None:
        self.session = session
        self.project = project
        self.project_uuid = project.id  # type: ignore[attr-defined]
        self.lang_code = lang_code

    async def execute(self) -> AsyncGenerator[str, None]:
        try:
            # 1. Load raw graph data
            graph_repo = SQLAlchemyGraphRepository(self.session)
            all_nodes = await graph_repo.get_nodes_by_project(self.project_uuid)
            all_edges = await graph_repo.get_edges_by_project(self.project_uuid)

            project_path = os.path.abspath(self.project.path)  # type: ignore[attr-defined]

            filtered_nodes = [
                n for n in all_nodes if Path(n.file_path).resolve().is_relative_to(Path(project_path).resolve())
            ]
            valid_ids = {n.id for n in filtered_nodes}
            filtered_edges = [
                e for e in all_edges if e.source_id in valid_ids and e.target_id in valid_ids
            ]

            # 2. Collapse AST graph → file-level graph
            file_nodes_dict, nx_edges = _build_file_level_graph(filtered_nodes, filtered_edges)
            file_nodes = list(file_nodes_dict.values())
            all_file_paths = {n["file_path"] for n in file_nodes}

            # 3. Compute structural metrics (CPU-bound → offloaded to thread)
            metrics: dict = await asyncio.to_thread(
                _compute_graph_metrics_cpu_bound,
                file_nodes,
                nx_edges,
            )

            # 4. Build LLM context XML
            dir_structure = _build_dir_structure(all_file_paths, project_path)
            main_langs_str = _build_main_langs_str(all_file_paths)
            top_files_xml = _build_top_files_xml(metrics)
            key_nodes, top_out_node = _select_key_nodes(file_nodes, nx_edges)
            key_files_xml = await _build_key_files_xml(key_nodes, top_out_node)

            project_context_xml = _build_project_context_xml(
                total_files=len(all_file_paths),
                main_langs_str=main_langs_str,
                dir_structure=dir_structure,
                top_files_xml=top_files_xml,
                key_files_xml=key_files_xml,
            )

            # 5. Resolve LLM models from DB (single source of truth)
            resolved_provider, resolved_model, _ = await resolve_tool_model(
                self.session, "graph_analysis"
            )
            extractor_provider, extractor_model_id, _ = await resolve_tool_model(
                self.session, "phantom_extractor"
            )

            resolved_model_id = tool_model_label(resolved_provider, resolved_model)
            extractor_model = tool_model_label(extractor_provider, extractor_model_id)
            gateway = LiteLLMGateway(model_name=resolved_model_id)

            # 6. Stream LLM analysis chunks to client
            full_text: list[str] = []
            async for chunk in gateway.analyze_anomalies_stream(
                self.project.name,  # type: ignore[attr-defined]
                self.project.path,  # type: ignore[attr-defined]
                metrics,
                {},
                project_context_xml,
                lang_code=self.lang_code,
            ):
                full_text.append(chunk)
                yield f"data: {json.dumps({'type': 'message_chunk', 'text': chunk})}\n\n"

            final_content = "".join(full_text)

            # 7. Persist report (non-blocking, uses its own session)
            if final_content.strip():
                await _persist_report(self.project_uuid, resolved_model_id, final_content, metrics)

            # 8. Extract and stream Kanban suggestions
            try:
                extracted_tickets = await gateway.extract_kanban_tickets_phantom(
                    final_content, extractor_model, lang_code=self.lang_code
                )
                if extracted_tickets:
                    yield f"data: {json.dumps({'type': 'kanban_suggestions', 'tickets': extracted_tickets})}\n\n"
            except Exception as ex:
                logger.error("Failed to generate kanban suggestions: %s", ex)

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except asyncio.CancelledError:
            logger.warning("Streaming cancelled by client.")
            raise
        except Exception as e:
            logger.error("Error streaming LLM response: %s", e, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': 'An internal error occurred'})}\n\n"
