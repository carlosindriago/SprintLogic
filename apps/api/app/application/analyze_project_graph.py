import asyncio
import json
import logging
import os
import uuid
from collections.abc import AsyncGenerator

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


class AnalyzeProjectGraphUseCase:
    """
    Business logic for analyzing the project graph.
    Extracts context from the graph and streams LLM analysis to the client,
    while saving the report in the background.
    """

    def __init__(
        self,
        session: AsyncSession,
        project,
        lang_code: str = "en",
    ):
        self.session = session
        self.project = project
        self.project_uuid = project.id
        self.lang_code = lang_code

    async def execute(self) -> AsyncGenerator[str, None]:
        try:
            graph_repo = SQLAlchemyGraphRepository(self.session)
            nodes = await graph_repo.get_nodes_by_project(self.project_uuid)
            edges = await graph_repo.get_edges_by_project(self.project_uuid)

            project_path = os.path.abspath(self.project.path)
            filtered_nodes = [n for n in nodes if os.path.abspath(n.file_path).startswith(project_path)]

            valid_ids = {n.id for n in filtered_nodes}
            filtered_edges = [e for e in edges if e.source_id in valid_ids and e.target_id in valid_ids]

            node_file_paths = {n.id: os.path.abspath(n.file_path) for n in filtered_nodes}
            pruned_edges = [e for e in filtered_edges if node_file_paths.get(e.source_id) != node_file_paths.get(e.target_id)]

            file_nodes_dict: dict[str, dict] = {}
            for n in filtered_nodes:
                if not n.file_path:
                    continue
                abs_path = os.path.abspath(n.file_path)
                if abs_path not in file_nodes_dict:
                    fname = os.path.basename(abs_path)
                    is_test_flag = abs_path.endswith(".spec.ts") or abs_path.endswith("Test.java")
                    file_nodes_dict[abs_path] = {
                        "id": abs_path,
                        "label": fname,
                        "is_test": is_test_flag,
                        "file_path": abs_path,
                    }

            nodes_for_metrics = list(file_nodes_dict.values())

            seen_file_edges: set[tuple[str, str]] = set()
            nx_edges = []
            for e in pruned_edges:
                src_file = node_file_paths.get(e.source_id)
                tgt_file = node_file_paths.get(e.target_id)
                if src_file and tgt_file and src_file != tgt_file:
                    pair = (src_file, tgt_file)
                    if pair not in seen_file_edges:
                        seen_file_edges.add(pair)
                        edge_type = e.type.value if hasattr(e.type, "value") else str(e.type)
                        nx_edges.append({
                            "source": src_file,
                            "target": tgt_file,
                            "type": edge_type
                        })

            # --- CONTEXT EXTRACTION ---
            all_file_paths = {os.path.abspath(n.file_path) for n in filtered_nodes if n.file_path}
            total_files = len(all_file_paths)

            extensions: dict[str, int] = {}
            for path in all_file_paths:
                ext = os.path.splitext(path)[1].lower()
                if ext:
                    extensions[ext] = extensions.get(ext, 0) + 1

            sorted_exts = sorted(extensions.items(), key=lambda x: x[1], reverse=True)[:3]
            main_langs_str = ", ".join([f"{ext} ({count})" for ext, count in sorted_exts])

            class DirNode:
                def __init__(self):
                    self.children = {}

            root_dir = DirNode()
            for path in all_file_paths:
                rel_path = os.path.relpath(path, project_path)
                parts = rel_path.split(os.sep)[:-1]
                current = root_dir
                for part in parts:
                    if part not in current.children:
                        current.children[part] = DirNode()
                    current = current.children[part]

            def collapse_tree(node, current_name=""):
                while len(node.children) == 1:
                    child_name, child_node = next(iter(node.children.items()))
                    current_name = f"{current_name}/{child_name}" if current_name else child_name
                    node = child_node

                result_children = {}
                for child_name, child_node in node.children.items():
                    res_name, res_node = collapse_tree(child_node, child_name)
                    result_children[res_name] = res_node

                class DummyNode:
                    pass
                ret_node = DummyNode()
                ret_node.children = result_children
                return current_name, ret_node

            _, collapsed_root = collapse_tree(root_dir)

            def format_tree(node, prefix="", depth=1, max_depth=3):
                lines = []
                if depth > max_depth:
                    return lines
                for child_name, child_node in sorted(node.children.items()):
                    lines.append(f"{prefix}- {child_name}/")
                    lines.extend(format_tree(child_node, prefix + "  ", depth + 1, max_depth))
                return lines

            dir_structure = "\n".join(format_tree(collapsed_root))

            metrics = await asyncio.to_thread(
                _compute_graph_metrics_cpu_bound,
                nodes_for_metrics,
                nx_edges,
            )

            top_files_xml = "<archivos_con_mas_dependencias>\n"
            for go in metrics.get("god_objects_in", [])[:5]:
                fpath = go.get("file_path", go.get("node"))
                test_str = "test" if go.get("is_test") else "fuente"
                code_cnt = go.get("code_count", go["count"])
                api_cnt = go.get("api_count", 0)
                top_files_xml += (
                    f'  <archivo nombre="{fpath}" tipo="{test_str}">\n'
                    f"    <dependencias_codigo_entrantes>{code_cnt}</dependencias_codigo_entrantes>\n"
                    f"    <llamadas_api_http_entrantes>{api_cnt}</llamadas_api_http_entrantes>\n"
                    f"  </archivo>\n"
                )
            for go in metrics.get("god_objects_out", [])[:5]:
                fpath = go.get("file_path", go.get("node"))
                test_str = "test" if go.get("is_test") else "fuente"
                code_cnt = go.get("code_count", go["count"])
                api_cnt = go.get("api_count", 0)
                top_files_xml += (
                    f'  <archivo nombre="{fpath}" tipo="{test_str}">\n'
                    f"    <dependencias_codigo_salientes>{code_cnt}</dependencias_codigo_salientes>\n"
                    f"    <llamadas_api_http_salientes>{api_cnt}</llamadas_api_http_salientes>\n"
                    f"  </archivo>\n"
                )
            top_files_xml += "</archivos_con_mas_dependencias>"

            in_degrees: dict[str, int] = {}
            out_degrees: dict[str, int] = {}
            for edge_dict in nx_edges:
                src = edge_dict["source"]
                tgt = edge_dict["target"]
                out_degrees[src] = out_degrees.get(src, 0) + 1
                in_degrees[tgt] = in_degrees.get(tgt, 0) + 1

            file_nodes = list(file_nodes_dict.values())

            top_out_node = max(file_nodes, key=lambda n: out_degrees.get(n["id"], 0), default=None)
            top_in_nodes = sorted(
                [n for n in file_nodes if n != top_out_node],
                key=lambda n: in_degrees.get(n["id"], 0),
                reverse=True
            )[:2]

            key_nodes = [n for n in [top_out_node] + top_in_nodes if n is not None]

            key_files_xml = "<archivos_clave_dominio>\n"
            for node in key_nodes:
                file_path = node["file_path"]
                if not file_path or not await asyncio.to_thread(os.path.exists, file_path):
                    continue

                try:
                    with open(file_path, encoding="utf-8") as f:
                        lines = f.readlines()
                    content = "".join(lines[:300])
                    if len(lines) > 300:
                        content += "\n... [CÓDIGO TRUNCADO PARA PROTEGER CONTEXTO] ..."

                    node_role = "Orquestador/Router (Alto Fan-Out)" if node == top_out_node else "Core/Dominio (Alto Fan-In)"
                    key_files_xml += f"""  <archivo rol="{node_role}" ruta="{file_path}">\n    <codigo_fuente>\n{content}\n    </codigo_fuente>\n  </archivo>\n"""
                except Exception:
                    logger.warning("Unhandled exception", exc_info=True)
                    pass

            key_files_xml += "</archivos_clave_dominio>"

            project_context_xml = f"""<contexto_del_proyecto>
  <estadisticas>
    <archivos_fuente_reales>{total_files}</archivos_fuente_reales>
    <lenguajes_principales>{main_langs_str}</lenguajes_principales>
  </estadisticas>
  <estructura_directorios>
{dir_structure}
  </estructura_directorios>
  {top_files_xml}
  {key_files_xml}
</contexto_del_proyecto>"""

            resolved_provider, resolved_model, _ = await resolve_tool_model(self.session, "graph_analysis")
            resolved_model_id = tool_model_label(resolved_provider, resolved_model)
            gateway = LiteLLMGateway(model_name=resolved_model_id)

            extractor_provider, extractor_model_id, _ = await resolve_tool_model(self.session, "phantom_extractor")
            extractor_model = tool_model_label(extractor_provider, extractor_model_id)

            full_text = []
            async for chunk in gateway.analyze_anomalies_stream(
                self.project.name, self.project.path, metrics, {}, project_context_xml, lang_code=self.lang_code
            ):
                full_text.append(chunk)
                yield f"data: {json.dumps({'type': 'message_chunk', 'text': chunk})}\n\n"

            final_content = "".join(full_text)
            if final_content.strip():
                async with get_sessionmaker()() as db_session:
                    new_report = AnalysisReportModel(
                        id=uuid.uuid4(),
                        project_id=self.project_uuid,
                        type="code_analysis",
                        content=final_content,
                        ai_model_version=resolved_model_id,
                        structural_metrics=metrics
                    )
                    db_session.add(new_report)
                    await db_session.commit()

            try:
                extracted_tickets = await gateway.extract_kanban_tickets_phantom(final_content, extractor_model, lang_code=self.lang_code)
                if extracted_tickets:
                    yield f"data: {json.dumps({'type': 'kanban_suggestions', 'tickets': extracted_tickets})}\n\n"
            except Exception as ex:
                logger.error(f"Failed to generate kanban suggestions: {ex}")

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except asyncio.CancelledError:
            logger.warning("Streaming cancelled by client.")
            raise
        except Exception as e:
            logger.error("Error streaming LLM response: %s", e, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': 'An internal error occurred'})}\n\n"
