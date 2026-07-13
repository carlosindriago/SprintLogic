from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any


class LanguageAnalyzerStrategy(ABC):
    """
    Abstract port representing a strategy to parse a specific programming language.
    """

    @abstractmethod
    def is_compatible(self, project_path: Path) -> bool:
        """
        Evaluate if this strategy is capable of parsing the given project.
        """
        pass

    @abstractmethod
    async def parse_dependencies(self, project_path: Path) -> dict[str, Any]:
        """
        Parse the project and return a dictionary representing the dependency graph.
        Expected format: {"nodes": [...], "edges": [...]}
        """
        pass

    async def parse_skeletons(self, project_path: Path, relative_paths: list[str]) -> dict[str, Any]:
        """
        Extract skeletons (imports, classes, functions, and short full text) for the target files
        using the tree-sitter parser defined in the strategy (self.parser).
        """
        if not hasattr(self, "parser"):
            return {}
            
        skeletons = {}
        for rel_path in relative_paths:
            filepath = project_path / rel_path
            if not filepath.exists():
                continue
                
            code = filepath.read_bytes()
            tree = self.parser.parse(code)
            
            file_skeletons = []
            
            def traverse(node):
                # Recolectar imports/uses para mantener contexto
                if node.type in [
                    'import_declaration', 'use_declaration', 'namespace_use_declaration',
                    'import_statement', 'import_from_statement'
                ]:
                    file_skeletons.append(node.text.decode('utf8', errors='ignore'))
                    return
                    
                # Identify declaration nodes
                if node.type in [
                    'function_declaration', 'method_declaration', 'class_declaration', 'type_declaration',
                    'function_definition', 'class_definition', 'method_definition', 'interface_declaration'
                ]:
                    block_types = ['block', 'class_body', 'compound_statement', 'declaration_list', 'statement_block']
                    block_node = None
                    for child in node.children:
                        if child.type in block_types:
                            block_node = child
                            break
                    
                    if block_node:
                        sig = code[node.start_byte:block_node.start_byte].decode('utf8', errors='ignore').strip()
                        file_skeletons.append(sig + " { ... }")
                        traverse(block_node)
                    else:
                        file_skeletons.append(node.text.decode('utf8', errors='ignore'))
                else:
                    for child in node.children:
                        traverse(child)
                        
            traverse(tree.root_node)
            skeletons[rel_path] = "\n".join(file_skeletons)
            
        return skeletons
