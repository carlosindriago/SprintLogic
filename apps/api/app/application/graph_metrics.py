import networkx as nx  # type: ignore


def _compute_graph_metrics_cpu_bound(nodes_data: list, edges_data: list) -> dict:
    """
    Computes graph metrics deterministically.
    Runs in a separate ProcessPoolExecutor so it doesn't block the Event Loop.
    """
    G = nx.DiGraph()

    # Add nodes with their attributes
    for n in nodes_data:
        G.add_node(n["id"], label=n["label"], is_test=n.get("is_test", False), file_path=n.get("file_path", ""))

    # Add edges with their types
    for e in edges_data:
        G.add_edge(e["source"], e["target"], type=e.get("type", "UNKNOWN"))

    # 1. Cyclic dependencies with length bound to avoid exponential trap
    # simple_cycles with length_bound is available in networkx >= 3.0
    cycles = list(nx.simple_cycles(G, length_bound=5))

    # 2. God Objects (In-Degree)
    in_degrees = sorted(G.in_degree(), key=lambda x: x[1], reverse=True)
    god_objects_in = []
    for node, count in in_degrees[:5]:
        if count > 10:  # Threshold
            node_data = G.nodes[node]
            dependents = []
            for pred in G.predecessors(node):
                edge_data = G.get_edge_data(pred, node)
                pred_data = G.nodes[pred]
                test_flag = " (Test)" if pred_data.get("is_test") else ""
                dependents.append(f"[{edge_data.get('type', 'UNKNOWN')}] {pred_data.get('label', pred)}{test_flag}")

            summary = dependents[:10] + [f"+{count - 10} más"] if count > 10 else dependents
            god_objects_in.append({
                "node": node_data.get("label", node),
                "is_test": node_data.get("is_test", False),
                "count": count,
                "top_dependents": summary
            })

    # 3. God Objects (Out-Degree)
    out_degrees = sorted(G.out_degree(), key=lambda x: x[1], reverse=True)
    god_objects_out = []
    for node, count in out_degrees[:5]:
        if count > 10:  # Threshold
            node_data = G.nodes[node]
            dependencies = []
            for succ in G.successors(node):
                edge_data = G.get_edge_data(node, succ)
                succ_data = G.nodes[succ]
                test_flag = " (Test)" if succ_data.get("is_test") else ""
                dependencies.append(f"[{edge_data.get('type', 'UNKNOWN')}] {succ_data.get('label', succ)}{test_flag}")

            summary = dependencies[:10] + [f"+{count - 10} más"] if count > 10 else dependencies
            god_objects_out.append({
                "node": node_data.get("label", node),
                "is_test": node_data.get("is_test", False),
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
