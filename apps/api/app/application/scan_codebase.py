import asyncio
from pathlib import Path
from typing import Any

from app.application.graph_metrics import _compute_graph_metrics_cpu_bound
from app.domain.ports.language_analyzer import LanguageAnalyzerStrategy


class ScanCodebaseUseCase:
    def __init__(self, strategies: list[LanguageAnalyzerStrategy]):
        self.strategies = strategies

    async def execute(self, project_path: str) -> dict[str, Any]:
        path = Path(project_path)
        all_nodes = []
        all_edges = []

        # 1. Parsing Phase (Map)
        compatible_strategies = [s for s in self.strategies if s.is_compatible(path)]

        for strategy in compatible_strategies:
            res = await strategy.parse_dependencies(path)
            all_nodes.extend(res.get("nodes", []))
            all_edges.extend(res.get("edges", []))

        # 2. NetworkX Anomalies
        # Normalize keys for graph_metrics
        nx_edges = [{"source": e.get("source_id", e.get("source")), "target": e.get("target_id", e.get("target"))} for e in all_edges]
        metrics = await asyncio.to_thread(_compute_graph_metrics_cpu_bound, all_nodes, nx_edges)

        # 3. Lazy Fetching (Gathering Skeletons only for anomalies)
        problematic_files = set()

        for cycle in metrics.get("cyclic_dependencies", []):
            for node in cycle:
                problematic_files.add(node)

        for god in metrics.get("god_objects_in", []):
            problematic_files.add(god["node"])

        for god in metrics.get("god_objects_out", []):
            problematic_files.add(god["node"])

        # Clean the "file:" prefix to get relative paths
        relative_paths = [f.replace("file:", "") for f in problematic_files if f.startswith("file:")]

        skeletons = {}
        for strategy in compatible_strategies:
            strat_skeletons = await strategy.parse_skeletons(path, relative_paths)
            skeletons.update(strat_skeletons)

        return {
            "metrics": metrics,
            "skeletons": skeletons,
            "nodes": all_nodes,
            "edges": all_edges
        }
