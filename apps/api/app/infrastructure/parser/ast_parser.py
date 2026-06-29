import os
import tree_sitter
try:
    import tree_sitter_python
except ImportError:
    tree_sitter_python = None
try:
    import tree_sitter_typescript
except ImportError:
    tree_sitter_typescript = None
try:
    import tree_sitter_java
except ImportError:
    tree_sitter_java = None
try:
    import tree_sitter_php
except ImportError:
    tree_sitter_php = None
try:
    import tree_sitter_go
except ImportError:
    tree_sitter_go = None
try:
    import tree_sitter_html
except ImportError:
    tree_sitter_html = None
try:
    import tree_sitter_css
except ImportError:
    tree_sitter_css = None

from app.domain.graph_models import GraphNode, NodeLabel, GraphEdge, EdgeType

def get_language(ext):
    if ext == ".py" and tree_sitter_python:
        return tree_sitter.Language(tree_sitter_python.language())
    elif ext == ".ts" and tree_sitter_typescript:
        return tree_sitter.Language(tree_sitter_typescript.language_typescript())
    elif ext == ".tsx" and tree_sitter_typescript:
        return tree_sitter.Language(tree_sitter_typescript.language_tsx())
    elif ext == ".java" and tree_sitter_java:
        return tree_sitter.Language(tree_sitter_java.language())
    elif ext == ".php" and tree_sitter_php:
        # Note: tree_sitter_php has multiple languages, usually language_php()
        return tree_sitter.Language(tree_sitter_php.language_php())
    elif ext == ".go" and tree_sitter_go:
        return tree_sitter.Language(tree_sitter_go.language())
    elif ext in (".html", ".htm") and tree_sitter_html:
        return tree_sitter.Language(tree_sitter_html.language())
    elif ext == ".css" and tree_sitter_css:
        return tree_sitter.Language(tree_sitter_css.language())
    return None

def extract_nodes_from_code(file_path: str, code: bytes, ext: str):
    lang = get_language(ext)
    if not lang:
        return [], []
        
    parser = tree_sitter.Parser(lang)
    tree = parser.parse(code)
    
    nodes = []
    edges = []
    
    file_node_id = f"file:{file_path}"
    file_node = GraphNode(
        id=file_node_id,
        label=NodeLabel.FILE,
        name=os.path.basename(file_path),
        file_path=file_path
    )
    nodes.append(file_node)
    
    def traverse(node):
        if node.type in ("class_definition", "class_declaration"):
            name_node = None
            for child in node.children:
                if child.type in ("identifier", "type_identifier"):
                    name_node = child
                    break
            if name_node:
                class_name = code[name_node.start_byte:name_node.end_byte].decode("utf-8")
                class_id = f"class:{file_path}:{class_name}"
                nodes.append(GraphNode(
                    id=class_id,
                    label=NodeLabel.CLASS,
                    name=class_name,
                    file_path=file_path
                ))
                edges.append(GraphEdge(
                    source_id=file_node_id,
                    target_id=class_id,
                    type=EdgeType.CONTAINS
                ))
                
        elif node.type in ("function_definition", "function_declaration", "method_definition"):
            name_node = None
            for child in node.children:
                if child.type in ("identifier", "property_identifier"):
                    name_node = child
                    break
            if name_node:
                func_name = code[name_node.start_byte:name_node.end_byte].decode("utf-8")
                func_id = f"function:{file_path}:{func_name}"
                nodes.append(GraphNode(
                    id=func_id,
                    label=NodeLabel.FUNCTION,
                    name=func_name,
                    file_path=file_path
                ))
                edges.append(GraphEdge(
                    source_id=file_node_id,
                    target_id=func_id,
                    type=EdgeType.CONTAINS
                ))
                
        for child in node.children:
            traverse(child)

    traverse(tree.root_node)
    return nodes, edges

class ASTParserService:
    def __init__(self, ignore_dirs=None):
        if ignore_dirs is None:
            self.ignore_dirs = {".git", "node_modules", "venv", ".venv", "__pycache__", ".pytest_cache", "migrations"}
        else:
            self.ignore_dirs = set(ignore_dirs)
            
    def parse_directory(self, dir_path: str):
        all_nodes = []
        all_edges = []
        
        for root, dirs, files in os.walk(dir_path):
            dirs[:] = [d for d in dirs if d not in self.ignore_dirs]
            
            for file in files:
                ext = os.path.splitext(file)[1]
                if ext in (".py", ".ts", ".tsx", ".java", ".php", ".go", ".html", ".htm", ".css"):
                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, "rb") as f:
                            code = f.read()
                        nodes, edges = extract_nodes_from_code(file_path, code, ext)
                        all_nodes.extend(nodes)
                        all_edges.extend(edges)
                    except Exception:
                        pass
                        
        return all_nodes, all_edges
