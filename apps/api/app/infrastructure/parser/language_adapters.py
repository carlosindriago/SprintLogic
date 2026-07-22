from abc import ABC, abstractmethod

from app.infrastructure.parser.ast_parser import ParsedNode, compute_ast_hash


class LanguageAdapter(ABC):
    """
    Adapter Interface to decouple AST extraction logic from the Graph Engine.
    """

    @abstractmethod
    def extract_nodes(self, tree, code_bytes: bytes, file_path: str) -> tuple[list[ParsedNode], set[str], set[str]]:
        """
        Extracts universal ParsedNode objects, imports, and api endpoints from a language-specific AST.
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

    def extract_nodes(self, tree, code_bytes: bytes, file_path: str) -> tuple[list[ParsedNode], set[str], set[str]]:
        parsed_nodes = []
        imports = set()
        api_endpoints = set()

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
        return parsed_nodes, imports, api_endpoints

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

    def extract_nodes(self, tree, code_bytes: bytes, file_path: str) -> tuple[list[ParsedNode], set[str], set[str]]:
        parsed_nodes, imports, _ = super().extract_nodes(tree, code_bytes, file_path)
        api_endpoints: set[str] = set()

        def extract_route_from_arg(arg_node) -> str:
            if arg_node.type == "string":
                # Regular string literal
                for child in arg_node.children:
                    if child.type == "string_fragment":
                        return code_bytes[child.start_byte:child.end_byte].decode('utf-8')
            elif arg_node.type == "template_string":
                # Template string like `/api/users/${id}`
                # We can replace template substitutions with `*`
                parts = []
                for child in arg_node.children:
                    if child.type == "string_fragment":
                        parts.append(code_bytes[child.start_byte:child.end_byte].decode('utf-8'))
                    elif child.type == "template_substitution":
                        parts.append("*")
                return "".join(parts)
            elif arg_node.type == "binary_expression":
                # Something like `baseUrl + "/api"`
                # Very simple heuristic: just assume variables are `*`
                # A more complete AST resolution could recursively evaluate this, but for now we fallback
                # Let's extract any string_fragment from the binary expression and replace the rest with *
                # To do it simply, we can extract the raw text and replace identifiers with *
                # But it's easier to just traverse and collect strings and non-strings
                parts = []
                def traverse_binary(n):
                    if n.type == "string":
                        for c in n.children:
                            if c.type == "string_fragment":
                                parts.append(code_bytes[c.start_byte:c.end_byte].decode('utf-8'))
                    elif n.type in ("identifier", "member_expression", "call_expression"):
                        parts.append("*")
                    else:
                        for c in n.children:
                            traverse_binary(c)
                traverse_binary(arg_node)
                return "".join(parts).replace("**", "*")
            return ""

        def traverse_calls(node):
            if node.type == "call_expression":
                # Check if it's an HTTP call (e.g. this.http.get)
                # It would look like: function: member_expression
                is_http = False
                for child in node.children:
                    if child.type == "member_expression":
                        # Check the property
                        prop_name = ""
                        for n in child.children:
                            if n.type == "property_identifier":
                                prop_name = code_bytes[n.start_byte:n.end_byte].decode('utf-8')
                        if prop_name in ("get", "post", "put", "delete", "patch", "request"):
                            # We found a potential HTTP call. We could check if object ends with 'http' or 'httpClient'
                            # but for now this is a strong signal if inside Angular services.
                            is_http = True
                            verb = prop_name.upper()
                            if verb == "REQUEST":
                                verb = "ANY"
                    elif child.type == "arguments" and is_http:
                        # First argument is usually the URL
                        if len(child.children) >= 2: # '(' then arg1
                            arg1 = child.children[1]
                            route = extract_route_from_arg(arg1)
                            if route and ("/" in route or "api" in route):
                                api_endpoints.add(f"CONSUMES:{verb}:{route}")

            for child in node.children:
                traverse_calls(child)

        traverse_calls(tree.root_node)

        return parsed_nodes, imports, api_endpoints

class JavaAdapter(GenericTreeSitterAdapter):
    def __init__(self):
        super().__init__(
            class_types=("class_declaration",),
            method_types=("method_declaration",),
            identifier_types=("identifier",)
        )

    def extract_nodes(self, tree, code_bytes: bytes, file_path: str) -> tuple[list[ParsedNode], set[str], set[str]]:
        parsed_nodes, imports, _ = super().extract_nodes(tree, code_bytes, file_path)
        api_endpoints = set()

        def extract_string_value(node):
            for child in node.children:
                if child.type == "string_literal":
                    for sub in child.children:
                        if sub.type == "string_fragment":
                            return code_bytes[sub.start_byte:sub.end_byte].decode('utf-8')
            return None

        # Pass 1: Find class level @RequestMapping
        class_routes = {}

        def traverse_classes(node):
            if node.type == "class_declaration":
                class_name = None
                route = ""
                for child in node.children:
                    if child.type == "modifiers":
                        for mod in child.children:
                            if mod.type == "annotation":
                                ann_name = ""
                                for n in mod.children:
                                    if n.type == "identifier":
                                        ann_name = code_bytes[n.start_byte:n.end_byte].decode('utf-8')
                                if ann_name == "RequestMapping":
                                    for n in mod.children:
                                        if n.type == "annotation_argument_list":
                                            val = extract_string_value(n)
                                            if val:
                                                route = val
                    elif child.type == "identifier" and not class_name:
                        class_name = code_bytes[child.start_byte:child.end_byte].decode('utf-8')

                if class_name and route:
                    class_routes[class_name] = route

            for child in node.children:
                traverse_classes(child)

        traverse_classes(tree.root_node)

        # Pass 2: Find method level mapping
        def traverse_methods(node, current_class_route=""):
            if node.type == "class_declaration":
                cname = None
                for child in node.children:
                    if child.type == "identifier":
                        cname = code_bytes[child.start_byte:child.end_byte].decode('utf-8')
                        break
                if cname in class_routes:
                    current_class_route = class_routes[cname]

            if node.type == "method_declaration":
                for child in node.children:
                    if child.type == "modifiers":
                        for mod in child.children:
                            if mod.type == "annotation":
                                ann_name = ""
                                for n in mod.children:
                                    if n.type == "identifier":
                                        ann_name = code_bytes[n.start_byte:n.end_byte].decode('utf-8')
                                if ann_name in ("GetMapping", "PostMapping", "PutMapping", "DeleteMapping", "PatchMapping", "RequestMapping"):
                                    
                                    verb = "ANY"
                                    if ann_name == "GetMapping": verb = "GET"
                                    elif ann_name == "PostMapping": verb = "POST"
                                    elif ann_name == "PutMapping": verb = "PUT"
                                    elif ann_name == "DeleteMapping": verb = "DELETE"
                                    elif ann_name == "PatchMapping": verb = "PATCH"

                                    for n in mod.children:
                                        if n.type == "annotation_argument_list":
                                            val = extract_string_value(n)
                                            full_route = current_class_route
                                            if val:
                                                full_route += val
                                            if full_route:
                                                api_endpoints.add(f"EXPOSES:{verb}:{full_route}")

            for child in node.children:
                traverse_methods(child, current_class_route)

        traverse_methods(tree.root_node)

        return parsed_nodes, imports, api_endpoints

class PhpAdapter(LanguageAdapter):
    def extract_nodes(self, tree, code_bytes: bytes, file_path: str) -> tuple[list[ParsedNode], set[str], set[str]]:
        parsed_nodes = []
        imports = set()
        api_endpoints = set()

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
        return parsed_nodes, imports, api_endpoints

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
