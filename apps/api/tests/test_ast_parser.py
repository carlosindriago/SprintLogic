from app.infrastructure.parser.ast_parser import extract_nodes_from_code
from app.domain.graph_models import NodeLabel, EdgeType

def test_extract_nodes_from_python_code():
    code = b"""
class MyClass:
    def my_method(self):
        pass

def my_function():
    pass
"""
    from uuid import uuid4
    file_path = "fake/path.py"
    project_id = uuid4()
    nodes, edges, _ = extract_nodes_from_code(project_id, file_path, code, ".py")
    
    assert len(nodes) == 4 # File, MyClass, my_method, my_function
    
    file_node = next(n for n in nodes if n.label == NodeLabel.FILE)
    assert file_node.name == "path.py"
    
    class_node = next(n for n in nodes if n.label == NodeLabel.CLASS)
    assert class_node.name == "MyClass"
    
    func_node = next(n for n in nodes if n.label == NodeLabel.FUNCTION and n.name == "my_function")
    assert func_node is not None
    
    method_node = next(n for n in nodes if n.label == NodeLabel.FUNCTION and n.name == "my_method")
    assert method_node is not None
    
    assert len(edges) == 3
    for edge in edges:
        assert edge.source_id == file_node.id
        assert edge.type == EdgeType.CONTAINS
        
    target_ids = {e.target_id for e in edges}
    assert class_node.id in target_ids
    assert func_node.id in target_ids
    assert method_node.id in target_ids
