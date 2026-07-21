from abc import ABC, abstractmethod

from app.infrastructure.parser.ast_parser import ParsedNode, compute_ast_hash


class LanguageAdapter(ABC):
    """
    Adapter Interface to decouple AST extraction logic from the Graph Engine.
    """

    @abstractmethod
    def extract_nodes(self, tree, code_bytes: bytes, file_path: str) -> tuple[list[ParsedNode], set[str]]:
        """
        Extracts universal ParsedNode objects and imports from a language-specific AST.
        """
        pass

class GenericTreeSitterAdapter(LanguageAdapter):
    """
    A generic adapter that implements the legacy traversal logic,
    abstracted away to comply with the OCP principle.
    Subclasses can override this with optimized S-expression queries.
    """
    def __init__(self, class_types: tuple, method_types: tuple, identifier_types: tuple):
        self.class_types = class_types
        self.method_types = method_types
        self.identifier_types = identifier_types

    def extract_nodes(self, tree, code_bytes: bytes, file_path: str) -> tuple[list[ParsedNode], set[str]]:
        parsed_nodes = []
        imports = set()

        def traverse(node, current_fqn: str):
            if "import" in node.type or "require" in node.type:
                for child in node.children:
                    if "string" in child.type:
                        imp = code_bytes[child.start_byte : child.end_byte].decode("utf-8").strip("\"'")
                        if imp:
                            imports.add(imp)
                    elif child.type in ("dotted_name", "identifier"):
                        imp = code_bytes[child.start_byte : child.end_byte].decode("utf-8")
                        if imp:
                            imports.add(imp)

            node_type = None
            name = None
            fqn = current_fqn

            if node.type in self.class_types:
                node_type = "class"
                for child in node.children:
                    if child.type in self.identifier_types:
                        name = code_bytes[child.start_byte:child.end_byte].decode('utf-8')
                        break
                if name:
                    fqn = f"{current_fqn}::[{node_type}]{name}"

            elif node.type in self.method_types:
                node_type = "def"
                for child in node.children:
                    if child.type in self.identifier_types:
                        name = code_bytes[child.start_byte:child.end_byte].decode('utf-8')
                        break
                if name:
                    fqn = f"{current_fqn}::[{node_type}]{name}"

            if name and node_type:
                content = code_bytes[node.start_byte:node.end_byte].decode('utf-8')
                node_hash = compute_ast_hash(content)
                parsed_nodes.append(ParsedNode(
                    fqn=fqn,
                    node_type=node_type,
                    name=name,
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                    content=content,
                    hash=node_hash,
                    parent_fqn=current_fqn
                ))

            for child in node.children:
                traverse(child, fqn)

        traverse(tree.root_node, file_path)
        return parsed_nodes, imports

class PythonAdapter(GenericTreeSitterAdapter):
    def __init__(self):
        super().__init__(
            class_types=("class_definition",),
            method_types=("function_definition",),
            identifier_types=("identifier",)
        )

class TypescriptAdapter(GenericTreeSitterAdapter):
    def __init__(self):
        super().__init__(
            class_types=("class_declaration",),
            method_types=("function_declaration", "method_definition"),
            identifier_types=("identifier", "property_identifier", "type_identifier")
        )

class JavaAdapter(GenericTreeSitterAdapter):
    def __init__(self):
        super().__init__(
            class_types=("class_declaration",),
            method_types=("method_declaration",),
            identifier_types=("identifier",)
        )

class PhpAdapter(LanguageAdapter):
    def extract_nodes(self, tree, code_bytes: bytes, file_path: str) -> tuple[list[ParsedNode], set[str]]:
        parsed_nodes = []
        imports = set()

        class_like_types = {
            "class_declaration",
            "interface_declaration",
            "trait_declaration",
            "enum_declaration",
        }
        method_like_types = {
            "method_declaration",
            "function_definition",
            "function_declaration",
        }

        def traverse(node, current_fqn: str):
            if node.type == "namespace_use_declaration":
                for child in node.children:
                    if child.type == "namespace_use_clause":
                        for subchild in child.children:
                            if subchild.type in ("qualified_name", "name"):
                                imp_text = code_bytes[subchild.start_byte:subchild.end_byte].decode("utf-8")
                                if imp_text:
                                    imports.add(imp_text)
            elif "require" in node.type or "include" in node.type:
                for child in node.children:
                    if "string" in child.type:
                        imp_text = code_bytes[child.start_byte:child.end_byte].decode("utf-8").strip("\"'")
                        if imp_text:
                            imports.add(imp_text)

            node_type = None
            name = None
            fqn = current_fqn

            if node.type in class_like_types:
                node_type = "class"
                for child in node.children:
                    if child.type == "name":
                        name = code_bytes[child.start_byte:child.end_byte].decode("utf-8")
                        break
                if name:
                    fqn = f"{current_fqn}::[{node_type}]{name}"

            elif node.type in method_like_types:
                node_type = "def"
                for child in node.children:
                    if child.type == "name":
                        name = code_bytes[child.start_byte:child.end_byte].decode("utf-8")
                        break
                if name:
                    fqn = f"{current_fqn}::[{node_type}]{name}"

            if name and node_type:
                content = code_bytes[node.start_byte:node.end_byte].decode("utf-8")
                node_hash = compute_ast_hash(content)
                parsed_nodes.append(ParsedNode(
                    fqn=fqn,
                    node_type=node_type,
                    name=name,
                    start_line=node.start_point[0] + 1,
                    end_line=node.end_point[0] + 1,
                    content=content,
                    hash=node_hash,
                    parent_fqn=current_fqn
                ))

            for child in node.children:
                traverse(child, fqn)

        traverse(tree.root_node, file_path)
        return parsed_nodes, imports

class GoAdapter(GenericTreeSitterAdapter):
    def __init__(self):
        super().__init__(
            class_types=("type_declaration",),
            method_types=("function_declaration", "method_declaration"),
            identifier_types=("identifier", "type_identifier", "field_identifier")
        )

def get_adapter(ext: str) -> LanguageAdapter | None:
    adapters = {
        ".py": PythonAdapter(),
        ".ts": TypescriptAdapter(),
        ".tsx": TypescriptAdapter(),
        ".java": JavaAdapter(),
        ".php": PhpAdapter(),
        ".go": GoAdapter(),
        ".html": GenericTreeSitterAdapter((), (), ()),  # Fallback
        ".css": GenericTreeSitterAdapter((), (), ()),
    }
    return adapters.get(ext)
