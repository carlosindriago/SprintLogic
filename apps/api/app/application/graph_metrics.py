import networkx as nx  # type: ignore


def _compute_graph_metrics_cpu_bound(nodes_data: list, edges_data: list) -> dict:
    """
    Computes graph metrics deterministically.
    Runs in a separate ProcessPoolExecutor so it doesn't block the Event Loop.
    """
    G = nx.DiGraph()
    # Safely extract IDs to avoid unhashable dict error
    G.add_nodes_from(n["id"] for n in nodes_data)
    G.add_edges_from([(e["source"], e["target"]) for e in edges_data])

    # 1. Cyclic dependencies with length bound to avoid exponential trap
    # simple_cycles with length_bound is available in networkx >= 3.0
    cycles = list(nx.simple_cycles(G, length_bound=5))

    # 2. God Objects (In-Degree)
    in_degrees = sorted(G.in_degree(), key=lambda x: x[1], reverse=True)
    god_objects_in = []
    for node, count in in_degrees[:5]:
        if count > 10:  # Threshold
            dependents = list(G.predecessors(node))
            summary = dependents[:3] + [f"+{count - 3} más"] if count > 3 else dependents
            god_objects_in.append({
                "node": node,
                "count": count,
                "top_dependents": summary
            })

    # 3. God Objects (Out-Degree)
    out_degrees = sorted(G.out_degree(), key=lambda x: x[1], reverse=True)
    god_objects_out = []
    for node, count in out_degrees[:5]:
        if count > 10:  # Threshold
            dependencies = list(G.successors(node))
            summary = dependencies[:3] + [f"+{count - 3} más"] if count > 3 else dependencies
            god_objects_out.append({
                "node": node,
                "count": count,
                "top_dependencies": summary
            })

    # 4. Isolated components (for Domain boundaries)
    isolated = nx.number_weakly_connected_components(G)

    return {
        "cyclic_dependencies": cycles[:10], # Truncate to save tokens
        "god_objects_in": god_objects_in,
        "god_objects_out": god_objects_out,
        "isolated_components": isolated
    }
