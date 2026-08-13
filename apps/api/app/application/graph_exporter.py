import asyncio
import os
from collections.abc import Sequence
from uuid import UUID

import networkx as nx
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.ai.scanner._build_report import _build_tree
from app.infrastructure.db.database import get_sessionmaker
from app.infrastructure.db.models import GraphEdgeModel, GraphNodeModel
from app.infrastructure.repositories.graph_repository import SQLAlchemyGraphRepository


def _compute_metrics_and_format(
    nodes: Sequence[GraphNodeModel],
    edges: Sequence[GraphEdgeModel],
    project_path: str,
    max_files: int | None = None,
) -> str:
    G: nx.DiGraph = nx.DiGraph()
    # Add nodes
    for node in nodes:
        # Keep relative paths for better readability
        rel_path = os.path.relpath(node.file_path, project_path) if project_path else node.file_path
        G.add_node(node.id, path=rel_path)

    # Add edges
    for edge in edges:
        G.add_edge(edge.source_id, edge.target_id)

    in_degrees = dict(G.in_degree())
    out_degrees = dict(G.out_degree())

    # Cycles
    cyclic_nodes = set()
    for scc in nx.strongly_connected_components(G):
        if len(scc) > 1:
            cyclic_nodes.update(scc)

    # Calculate score
    scored_files = []
    for node_id in G.nodes():
        node_in = in_degrees.get(node_id, 0)
        node_out = out_degrees.get(node_id, 0)
        has_cycle = node_id in cyclic_nodes

        impact_score = node_in + node_out + (100 if has_cycle else 0)

        path = G.nodes[node_id].get("path", "")
        scored_files.append(
            {
                "path": path,
                "in": node_in,
                "out": node_out,
                "cycle": has_cycle,
                "score": impact_score,
            }
        )

    # Sort
    scored_files.sort(key=lambda x: x["score"], reverse=True)

    total_files = len(scored_files)
    if max_files and len(scored_files) > max_files:
        scored_files = scored_files[:max_files]
        truncated = True
    else:
        truncated = False

    # Build markdown
    lines = []
    lines.append("# Architecture Overview")
    lines.append(f"Total tracked files: {total_files}")
    lines.append(f"Total dependencies: {len(edges)}")
    lines.append("")

    lines.append("## Directory Structure")
    lines.append("```text")
    if project_path:
        lines.append(_build_tree(project_path, max_depth=3))
    else:
        lines.append("(No path available)")
    lines.append("```")
    lines.append("")

    lines.append("## All Files Table (Sorted by Impact)")
    lines.append(
        "| File Path | In-Degree (Dependents) | Out-Degree (Dependencies) | In Cycle? | Impact Score |"
    )
    lines.append("|---|---|---|---|---|")

    for f in scored_files:
        cycle_str = "Yes" if f["cycle"] else "No"
        lines.append(f"| `{f['path']}` | {f['in']} | {f['out']} | {cycle_str} | **{f['score']}** |")

    if truncated:
        lines.append("")
        lines.append(f"*... [Truncated: showing top {max_files} files by impact score]*")

    return "\n".join(lines)


async def generate_codebase_map_md(
    project_id: UUID,
    session: AsyncSession | None = None,
    max_files: int | None = None,
    project_path: str = "",
) -> str:
    async def fetch_graph(db: AsyncSession):
        repo = SQLAlchemyGraphRepository(db)
        nodes_ = await repo.get_nodes_by_project(project_id)
        edges_ = await repo.get_edges_by_project(project_id)
        return nodes_, edges_

    if session is None:
        async_session = get_sessionmaker()
        async with async_session() as bg_session:
            nodes, edges = await fetch_graph(bg_session)
    else:
        nodes, edges = await fetch_graph(session)

    # Process in background to avoid event loop blocking
    markdown = await asyncio.to_thread(
        _compute_metrics_and_format, nodes, edges, project_path, max_files
    )
    return markdown
