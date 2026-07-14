from app.domain.graph_models import EdgeType, NodeLabel
from app.infrastructure.parser.ast_parser import extract_nodes_from_code


def test_extract_nodes_from_python_code():
    code = b"""
class MyClass:
    def my_method(self):
        pass

def my_function():
    pass
"""
    import uuid

    project_id = uuid.uuid4()
    file_path = "fake/path.py"
    nodes, edges, _ = extract_nodes_from_code(project_id, file_path, code, ".py")

    assert len(nodes) == 4  # File, MyClass, my_method, my_function

    file_node = next(n for n in nodes if n.label == NodeLabel.FILE)
    assert file_node.name == "path.py"

    class_node = next(n for n in nodes if n.label == NodeLabel.CLASS)
    assert class_node.name == "MyClass"

    func_node = next(n for n in nodes if n.label == NodeLabel.FUNCTION and n.name == "my_function")
    assert func_node is not None

    method_node = next(n for n in nodes if n.label == NodeLabel.FUNCTION and n.name == "my_method")
    assert method_node is not None

    assert len(edges) == 3

    # Edges should represent the hierarchical structure
    # 1. file -> class
    # 2. file -> function
    # 3. class -> method

    edge_map = {(e.source_id, e.target_id): e.type for e in edges}

    assert (file_node.id, class_node.id) in edge_map
    assert (file_node.id, func_node.id) in edge_map
    assert (class_node.id, method_node.id) in edge_map

    for edge_type in edge_map.values():
        assert edge_type == EdgeType.CONTAINS
