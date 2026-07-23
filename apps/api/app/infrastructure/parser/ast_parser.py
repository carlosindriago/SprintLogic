import json
import os
import sys
from pathlib import Path

import tree_sitter

from app.infrastructure.parser.import_resolver import (
    TSConfigResolver,
    try_resolve_file,
)

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
    def parse_code(
        self, code: bytes, file_path: str, ext: str
    ) -> tuple[list[ParsedNode], set[str], set[str]]:
        if isinstance(code, str):
            code_bytes = code.encode("utf-8")
        else:
            code_bytes = code

        lang = get_language(ext)
        if not lang:
            return [], set(), set()

        parser = tree_sitter.Parser()
        parser.language = lang
        tree = parser.parse(code_bytes)

        from app.infrastructure.parser.language_adapters import get_adapter
        adapter = get_adapter(ext)
        if adapter:
            parsed_nodes, imports, api_endpoints = adapter.extract_nodes(tree, code_bytes, file_path)
        else:
            parsed_nodes, imports, api_endpoints = [], set(), set()

        return parsed_nodes, imports, api_endpoints


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


def resolve_import_edges(
    project_id: UUID,
    file_imports: dict[str, set[str]],
    file_paths: list[str],
    base_dir: Path,
) -> list[GraphEdge]:
    """
    Pasada 2 del análisis: Resuelve los imports contra el filesystem real.
    Ahora soporta Path Aliases de TypeScript (@/) y resolución relativa.
    """
    edges: list[GraphEdge] = []

    # Precompute file set for O(1) lookup
    file_set = set(file_paths)

    # Instanciar el resolver de TS
    alias_resolver = TSConfigResolver(file_paths)

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
                        edges.append(
                            GraphEdge(
                                project_id=project_id,
                                source_id=source_id,
                                target_id=target_id,
                                type=EdgeType.IMPORTS,
                            )
                        )
            else:
                # TS/JS/Go/Java resolutions
                target = None
                if imp.startswith("./") or imp.startswith("../"):
                    # Relative import
                    source_dir = Path(source_path_str).parent
                    resolved = (source_dir / imp).resolve()
                    try:
                        # Convert to relative to CWD to match file_paths
                        rel_path = str(resolved.relative_to(Path.cwd())).replace("\\", "/")
                    except ValueError:
                        rel_path = str(resolved).replace("\\", "/")
                    target = try_resolve_file(rel_path, file_set)
                elif alias_resolver.is_alias(imp):
                    # TS alias
                    target = alias_resolver.resolve(imp)
                else:
                    # External (node_modules) or unmapped workspace package -> skip
                    continue

                if target:
                    target_id = f"file:{target}"
                    if source_id != target_id:
                        edges.append(
                            GraphEdge(
                                project_id=project_id,
                                source_id=source_id,
                                target_id=target_id,
                                type=EdgeType.IMPORTS,
                            )
                        )

    return edges


def dedupe_edges(edges: list[GraphEdge]) -> list[GraphEdge]:
    """
    Collapses edges sharing the same (source_id, target_id, type) into a single one.

    Required before any bulk insert into `graph_edges`, which enforces a UNIQUE
    constraint on (project_id, source_id, target_id, type). Duplicates are expected
    and legitimate here: e.g. a TS/JS file with two different import statements that
    both resolve to the same target file (barrel imports, re-exports, multiple named
    imports from one module) will naturally produce the same IMPORTS edge twice.
    """
    unique_edges: dict[tuple[str, str, EdgeType], GraphEdge] = {}
    for edge in edges:
        key = (edge.source_id, edge.target_id, edge.type)
        unique_edges[key] = edge
    return list(unique_edges.values())


def resolve_api_edges(
    project_id: UUID, file_endpoints: dict[str, set[str]]
) -> list[GraphEdge]:
    edges = []

    # Separate consumers and exposers
    exposers: dict[str, set[tuple[str, str]]] = {} # e.g. {"file:/path/to/java": {("GET", "/api/users/*")}}
    consumers: dict[str, set[tuple[str, str]]] = {} # e.g. {"file:/path/to/ts": {("POST", "*/api/users/*")}}

    # Import the matcher
    from app.infrastructure.parser.route_matcher import (
        do_routes_match,
    )

    for file_id, endpoints in file_endpoints.items():
        for ep in endpoints:
            if ep.startswith("EXPOSES:"):
                # EXPOSES:VERB:/route
                parts = ep[8:].split(':', 1)
                if len(parts) == 2:
                    verb, route = parts
                    if file_id not in exposers:
                        exposers[file_id] = set()
                    exposers[file_id].add((verb, route))
            elif ep.startswith("CONSUMES:"):
                # CONSUMES:VERB:/route
                parts = ep[9:].split(':', 1)
                if len(parts) == 2:
                    verb, route = parts
                    if file_id not in consumers:
                        consumers[file_id] = set()
                    consumers[file_id].add((verb, route))

    for cons_file, cons_routes in consumers.items():
        for c_verb, c_route in cons_routes:
            for exp_file, exp_routes in exposers.items():
                for e_verb, e_route in exp_routes:
                    if c_verb == e_verb or c_verb == "ANY" or e_verb == "ANY":
                        if do_routes_match(c_route, e_route):
                            edges.append(
                                GraphEdge(
                                    project_id=project_id,
                                    source_id=cons_file,
                                    target_id=exp_file,
                                    type=EdgeType.API_CALL,
                                )
                            )

    return edges


def extract_nodes_from_code(
    project_id: UUID,
    file_path: str,
    code: bytes,
    ext: str,
    birth_dates: dict[str, int] | None = None,
) -> tuple[list[GraphNode], list[GraphEdge], set[str], set[str]]:
    parser = TreeSitterParser()
    parsed_nodes, imports, api_endpoints = parser.parse_code(code, file_path, ext)

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

    seen_fqns = set()
    for pnode in parsed_nodes:
        # Prevent UNIQUE constraint failure in DB due to overloaded or duplicate methods
        if pnode.fqn in seen_fqns:
            pnode.fqn = f"{pnode.fqn}_{pnode.start_line}"
        seen_fqns.add(pnode.fqn)

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

    return nodes, edges, imports, api_endpoints


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
                "target",
                "build",
                ".gradle",
                ".idea"
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
                        nodes, edges, imports, api_endpoints = extract_nodes_from_code(
                            project_id, file_path, code, ext
                        )
                        all_nodes.extend(nodes)
                        all_edges.extend(edges)
                        if imports:
                            file_imports[f"file:{file_path}"] = imports
                    except Exception:
                        pass

        # Resolve imports across files (Pasada 2 del compilador de dos pasadas)
        base_dir = Path(dir_path)
        file_paths = [n.file_path for n in all_nodes if n.label == NodeLabel.FILE]
        all_edges.extend(resolve_import_edges(project_id, file_imports, file_paths, base_dir))

        # Deduplicate edges to prevent DB IntegrityError (UNIQUE constraint failed)
        return all_nodes, dedupe_edges(all_edges)
