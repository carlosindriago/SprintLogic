import json
import os
import sys
from pathlib import Path

import tree_sitter

try:
    import tree_sitter_python
except ImportError:
    tree_sitter_python = None  # type: ignore[assignment]
try:
    import tree_sitter_typescript
except ImportError:
    tree_sitter_typescript = None  # type: ignore[assignment]
try:
    import tree_sitter_java
except ImportError:
    tree_sitter_java = None  # type: ignore[assignment]
try:
    import tree_sitter_php
except ImportError:
    tree_sitter_php = None  # type: ignore[assignment]
try:
    import tree_sitter_go
except ImportError:
    tree_sitter_go = None  # type: ignore[assignment]
try:
    import tree_sitter_html
except ImportError:
    tree_sitter_html = None  # type: ignore[assignment]
try:
    import tree_sitter_css
except ImportError:
    tree_sitter_css = None  # type: ignore[assignment]

from app.domain.graph_models import EdgeType, GraphEdge, GraphNode, NodeLabel


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


from uuid import UUID


def resolve_python_import(base_project_dir: Path, import_statement: str) -> Path | None:
    """
    Resuelve una declaración de importación de Python emulando la semántica del intérprete.
    Retorna la ruta física absoluta si el módulo existe en el proyecto local.
    Retorna None si pertenece a la librería estándar o es un paquete de terceros.
    """
    # Filtro Nivel 1: Bloqueo de la Librería Estándar
    base_module = import_statement.split(".")[0]
    if base_module in sys.stdlib_module_names:
        return None

    # Traducción Semántica de Nomenclatura
    rel_path = import_statement.replace(".", "/")

    # Filtro Nivel 2: Resolución de Archivo Físico
    # Evaluación de Módulo Directo
    module_path = base_project_dir / f"{rel_path}.py"
    if module_path.is_file():
        return module_path

    # Evaluación de Paquete
    package_path = base_project_dir / rel_path / "__init__.py"
    if package_path.is_file():
        return package_path

    # Filtro Nivel 3: Exclusión de Dependencias de Terceros
    return None


import asyncio
import hashlib
from dataclasses import dataclass


def compute_ast_hash(node_code: str) -> str:
    # Remove only edge whitespaces to avoid corrupting string literals inside the code
    normalized = node_code.strip()
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

@dataclass
class ParsedNode:
    fqn: str
    node_type: str
    name: str
    start_line: int
    end_line: int
    content: str
    hash: str
    parent_fqn: str

class TreeSitterParser:
    def parse_code(self, code: str | bytes, file_path: str, ext: str = ".py") -> tuple[list[ParsedNode], set[str]]:
        if isinstance(code, str):
            code_bytes = code.encode("utf-8")
        else:
            code_bytes = code

        lang = get_language(ext)
        if not lang:
            return [], set()

        parser = tree_sitter.Parser()
        parser.language = lang
        tree = parser.parse(code_bytes)

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

            if node.type in ("class_definition", "class_declaration"):
                node_type = "class"
                for child in node.children:
                    if child.type in ("identifier", "type_identifier"):
                        name = code_bytes[child.start_byte:child.end_byte].decode('utf-8')
                        break
                if name:
                    fqn = f"{current_fqn}::[{node_type}]{name}"

            elif node.type in ("function_definition", "function_declaration", "method_definition"):
                node_type = "def"
                for child in node.children:
                    if child.type in ("identifier", "property_identifier"):
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


async def fetch_git_birth_dates(repo_path: str) -> dict[str, int]:
    """Ejecuta `git log --diff-filter=A` una sola vez y devuelve
    un dict {file_path: first_commit_timestamp} con costo O(1)."""
    dates: dict[str, int] = {}
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "log", "--name-status", "--diff-filter=A",
            "--pretty=format:commit_time:%at",
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await proc.communicate()
        current_time = 0
        for line in stdout.decode("utf-8", errors="ignore").split("\n"):
            line = line.strip()
            if not line:
                continue
            if line.startswith("commit_time:"):
                current_time = int(line.split(":", 1)[1])
            elif line.startswith("A\t") and current_time:
                file_path = line[2:]
                if file_path not in dates:
                    dates[file_path] = current_time
    except Exception:
        pass
    return dates


def extract_nodes_from_code(
    project_id: UUID,
    file_path: str,
    code: bytes,
    ext: str,
    birth_dates: dict[str, int] | None = None,
):
    parser = TreeSitterParser()
    parsed_nodes, imports = parser.parse_code(code, file_path, ext)

    nodes = []
    edges = []

    file_node_id = f"file:{file_path}"
    lines = code.split(b'\n')
    birth_time = (birth_dates or {}).get(file_path)
    if birth_time is None:
        try:
            birth_time = int(os.path.getmtime(file_path))
        except OSError:
            birth_time = 0
    nodes.append(
        GraphNode(
            id=file_node_id,
            project_id=project_id,
            label=NodeLabel.FILE,
            name=os.path.basename(file_path),
            file_path=file_path,
            meta_data=json.dumps({
                "start_line": 1,
                "end_line": len(lines),
                "birth_time": birth_time,
            }),
            file_size=len(code),
            loc=len(lines),
        )
    )

    for pnode in parsed_nodes:
        nodes.append(
            GraphNode(
                id=pnode.fqn,
                project_id=project_id,
                label=NodeLabel.CLASS if pnode.node_type == "class" else NodeLabel.FUNCTION,
                name=pnode.name,
                file_path=file_path,
                meta_data=json.dumps({
                    "start_line": pnode.start_line,
                    "end_line": pnode.end_line,
                    "fqn": pnode.fqn,
                    "hash": pnode.hash,
                })
            )
        )
        parent_id = file_node_id if pnode.parent_fqn == file_path else pnode.parent_fqn
        edges.append(
            GraphEdge(
                project_id=project_id,
                source_id=parent_id,
                target_id=pnode.fqn,
                type=EdgeType.CONTAINS
            )
        )

    return nodes, edges, imports


class ASTParserService:
    def __init__(self, ignore_dirs=None):
        if ignore_dirs is None:
            self.ignore_dirs = {
                ".git",
                "node_modules",
                "venv",
                ".venv",
                "__pycache__",
                ".pytest_cache",
                "migrations",
            }
        else:
            self.ignore_dirs = set(ignore_dirs)

    def parse_directory(self, project_id: UUID, dir_path: str):
        all_nodes = []
        all_edges = []
        file_imports = {}

        for root, dirs, files in os.walk(dir_path):
            dirs[:] = [d for d in dirs if d not in self.ignore_dirs]

            for file in files:
                ext = os.path.splitext(file)[1]
                if ext in (".py", ".ts", ".tsx", ".java", ".php", ".go", ".html", ".htm", ".css"):
                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, "rb") as f:
                            code = f.read()
                        nodes, edges, imports = extract_nodes_from_code(
                            project_id, file_path, code, ext
                        )
                        all_nodes.extend(nodes)
                        all_edges.extend(edges)
                        if imports:
                            file_imports[f"file:{file_path}"] = imports
                    except Exception:
                        pass

        # Resolve imports across files
        base_dir = Path(dir_path)
        file_paths = [n.file_path for n in all_nodes if n.label == NodeLabel.FILE]

        for source_id, imports in file_imports.items():
            source_path_str = source_id.replace("file:", "")
            is_python = source_path_str.endswith(".py")

            for imp in imports:
                if not imp:
                    continue

                if is_python:
                    target_path = resolve_python_import(base_dir, imp)
                    if target_path:
                        target_id = f"file:{target_path}"
                        if source_id != target_id:
                            all_edges.append(
                                GraphEdge(
                                    project_id=project_id,
                                    source_id=source_id,
                                    target_id=target_id,
                                    type=EdgeType.IMPORTS,
                                )
                            )
                else:
                    normalized_imp = imp.replace(".", "/").lstrip("./@")
                    if not normalized_imp:
                        continue

                    target_stem = Path(normalized_imp).stem

                    for fp in file_paths:
                        fp_path = Path(fp)
                        if fp_path.stem == target_stem or fp_path.parent.name == target_stem:
                            target_id = f"file:{fp}"
                            if source_id != target_id:
                                all_edges.append(
                                    GraphEdge(
                                        project_id=project_id,
                                        source_id=source_id,
                                        target_id=target_id,
                                        type=EdgeType.IMPORTS,
                                    )
                                )
                                break
        # Deduplicate edges to prevent DB IntegrityError (UNIQUE constraint failed)
        unique_edges = {}
        for edge in all_edges:
            key = (edge.source_id, edge.target_id, edge.type)
            unique_edges[key] = edge

        return all_nodes, list(unique_edges.values())
