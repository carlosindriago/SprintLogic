import os
from pathlib import Path
from typing import Any

from app.domain.ports.language_analyzer import LanguageAnalyzerStrategy

class JavaAnalyzerStrategy(LanguageAnalyzerStrategy):
    def __init__(self) -> None:
        import tree_sitter_java
        from tree_sitter import Language, Parser
        self.java_language = Language(tree_sitter_java.language())
        self.parser = Parser(self.java_language)
        self._compile_queries()

    def _compile_queries(self) -> None:
        from tree_sitter import Query
        self.pass1_query = Query(self.java_language,
            """
            (package_declaration (scoped_identifier) @file.package)
            (class_declaration name: (identifier) @class.name)
            (interface_declaration name: (identifier) @class.name)
            (enum_declaration name: (identifier) @class.name)
            """
        )
        self.pass2_query = Query(self.java_language,
            """
            (import_declaration (scoped_identifier) @import.name)
            (import_declaration (scoped_identifier) @import.name (asterisk) @import.wildcard)
            
            (class_declaration (superclass (type_identifier) @class.extends))
            (class_declaration (super_interfaces (type_list (type_identifier) @class.implements)))
            
            (object_creation_expression type: (type_identifier) @instantiation.class)
            
            (method_invocation object: (identifier) @call.obj name: (identifier) @call.method)
            """
        )

    def is_compatible(self, project_path: Path) -> bool:
        return (project_path / "pom.xml").exists() or (project_path / "build.gradle").exists() or any(project_path.glob("*.java"))

    async def parse_dependencies(self, project_path: Path) -> dict[str, list[dict[str, Any]]]:
        nodes: list[dict[str, Any]] = []
        edges: list[dict[str, Any]] = []

        java_files = []
        for root, dirs, files in os.walk(project_path):
            dirs[:] = [d for d in dirs if d not in ("target", "build", ".m2", "bin")]
            for file in files:
                if file.endswith(".java"):
                    java_files.append(Path(root) / file)

        if not java_files:
            return {"nodes": [], "edges": []}

        symbol_table: dict[str, str] = {}
        parsed_trees = {}
        file_packages = {}

        from tree_sitter import QueryCursor
        
        for filepath in java_files:
            rel_path = filepath.relative_to(project_path).as_posix()
            
            nodes.append({
                "id": f"file:{rel_path}",
                "label": filepath.name,
                "type": "file",
                "language": "java",
                "file_path": rel_path
            })

            code = filepath.read_bytes()
            tree = self.parser.parse(code)
            parsed_trees[rel_path] = tree
            
            cursor = QueryCursor(self.pass1_query)
            current_package = ""
            
            captures = []
            for pattern_index, captures_dict in cursor.matches(tree.root_node):
                for capture_name, nodes_list in captures_dict.items():
                    for node in nodes_list:
                        captures.append((capture_name, node))
                        
            for capture_name, node in captures:
                if not node.text:
                    continue
                if capture_name == "file.package":
                    current_package = node.text.decode('utf8')
                    file_packages[rel_path] = current_package
                elif capture_name == "class.name":
                    class_name = node.text.decode('utf8')
                    if current_package:
                        fqn = f"{current_package}.{class_name}"
                        symbol_table[fqn] = f"file:{rel_path}"

        for filepath in java_files:
            rel_path = filepath.relative_to(project_path).as_posix()
            tree = parsed_trees[rel_path]
            current_package = file_packages.get(rel_path, "")
            
            cursor = QueryCursor(self.pass2_query)
            
            explicit_imports: dict[str, str] = {}
            wildcard_imports: list[str] = [current_package] if current_package else []
            wildcard_imports.append("java.lang") 
            
            captures = []
            for pattern_index, captures_dict in cursor.matches(tree.root_node):
                for capture_name, nodes_list in captures_dict.items():
                    for node in nodes_list:
                        captures.append((capture_name, node, pattern_index))
                        
            pattern_has_wildcard = set()
            for capture_name, node, pattern_index in captures:
                if capture_name == "import.wildcard":
                    pattern_has_wildcard.add(pattern_index)
                    
            for capture_name, node, pattern_index in captures:
                if not node.text:
                    continue
                if capture_name == "import.name":
                    import_fqn = node.text.decode('utf8')
                    if pattern_index in pattern_has_wildcard:
                        wildcard_imports.append(import_fqn)
                    else:
                        class_name = import_fqn.split('.')[-1]
                        explicit_imports[class_name] = import_fqn

            for capture_name, node, pattern_index in captures:
                if not node.text:
                    continue
                
                target_class = None
                if capture_name in ("class.extends", "class.implements", "instantiation.class", "call.obj"):
                    target_class = node.text.decode('utf8')
                    
                    if capture_name == "call.obj":
                        if target_class[0].islower() or target_class == "this" or target_class == "super":
                            continue
                            
                    target_fqn = None
                    if target_class in explicit_imports:
                        target_fqn = explicit_imports[target_class]
                    else:
                        for wc in wildcard_imports:
                            test_fqn = f"{wc}.{target_class}"
                            if test_fqn in symbol_table:
                                target_fqn = test_fqn
                                break
                    
                    if target_fqn and target_fqn in symbol_table:
                        target_file = symbol_table[target_fqn]
                        if target_file != f"file:{rel_path}":
                            edges.append({
                                "source_id": f"file:{rel_path}",
                                "target_id": target_file,
                                "type": "depends_on"
                            })
                            
        unique_edges = {f"{e['source_id']}->{e['target_id']}": e for e in edges}
        
        return {
            "nodes": nodes,
            "edges": list(unique_edges.values())
        }
