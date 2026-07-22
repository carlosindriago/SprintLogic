import json
from pathlib import Path
from typing import Any

from app.domain.ports.language_analyzer import LanguageAnalyzerStrategy


class PhpAnalyzerStrategy(LanguageAnalyzerStrategy):
    def __init__(self) -> None:
        import tree_sitter_php
        from tree_sitter import Language, Parser
        self.php_language = Language(tree_sitter_php.language_php())
        self.parser = Parser(self.php_language)
        self._compile_queries()

    def _compile_queries(self) -> None:
        from tree_sitter import Query
        self.query = Query(self.php_language,
            """
            (namespace_definition (namespace_name) @file.namespace)

            (namespace_use_declaration
              (namespace_use_clause
                (qualified_name) @use.fqn
                (name)? @use.alias
              )
            )

            (class_declaration
              name: (name) @class.name
            )
            (class_declaration
              (base_clause (name) @class.extends)
            )

            (object_creation_expression
              (name) @instantiation.class
            )
            (object_creation_expression
              (qualified_name) @instantiation.class
            )

            (scoped_call_expression
              scope: (name) @static.class
              name: (name) @static.method
            )
            """
        )

    def is_compatible(self, project_path: Path) -> bool:
        return (project_path / "composer.json").exists() or any(project_path.glob("*.php"))

    def _parse_composer(self, project_path: Path) -> dict[str, str]:
        composer_file = project_path / "composer.json"
        psr4_map: dict[str, str] = {}
        if composer_file.exists():
            try:
                data = json.loads(composer_file.read_text('utf-8'))
                autoload = data.get("autoload", {})
                psr4 = autoload.get("psr-4", {})
                for prefix, folder in psr4.items():
                    psr4_map[prefix] = folder
            except Exception:
                pass
        return psr4_map

    def _resolve_fqn(self, class_name: str, file_alias_map: dict[str, str], current_namespace: str) -> str:
        if class_name.startswith('\\'):
            return class_name # Global namespace, handled by caller

        if class_name in file_alias_map:
            return file_alias_map[class_name]

        if current_namespace:
            return f"{current_namespace}\\{class_name}"
        return class_name

    def _fqn_to_path(self, fqn: str, psr4_map: dict[str, str]) -> str | None:
        for prefix, folder in psr4_map.items():
            if fqn.startswith(prefix):
                remainder = fqn[len(prefix):].replace('\\', '/')
                target = folder.rstrip('/') + '/' + remainder + '.php'
                return target
        return None

    async def parse_dependencies(self, project_path: Path) -> dict[str, list[dict[str, Any]]]:
        nodes: list[dict[str, Any]] = []
        edges: list[dict[str, Any]] = []

        php_files = list(project_path.rglob("*.php"))
        if not php_files:
            return {"nodes": [], "edges": []}

        psr4_map = self._parse_composer(project_path)

        from tree_sitter import QueryCursor

        for filepath in php_files:
            rel_path = filepath.relative_to(project_path).as_posix()

            # Filter out vendor directory entirely
            if rel_path.startswith("vendor/"):
                continue

            nodes.append({
                "id": f"file:{rel_path}",
                "label": filepath.name,
                "type": "file",
                "language": "php",
                "file_path": rel_path
            })

            code = filepath.read_bytes()
            tree = self.parser.parse(code)

            cursor = QueryCursor(self.query)

            current_namespace = ""
            file_alias_map: dict[str, str] = {}

            captures = []
            for pattern_index, captures_dict in cursor.matches(tree.root_node):
                for capture_name, nodes_list in captures_dict.items():
                    for node in nodes_list:
                        captures.append((capture_name, node))

            last_fqn = None
            last_default_alias = None
            for capture_name, node in captures:
                if not node.text:
                    continue
                if capture_name == "file.namespace":
                    current_namespace = node.text.decode('utf8')
                elif capture_name == "use.fqn":
                    fqn = node.text.decode('utf8')
                    parts = fqn.split('\\')
                    default_alias = parts[-1] if parts else fqn
                    file_alias_map[default_alias] = fqn
                    last_fqn = fqn
                    last_default_alias = default_alias
                elif capture_name == "use.alias":
                    alias = node.text.decode('utf8')
                    if last_fqn and last_default_alias:
                        if last_default_alias in file_alias_map:
                            del file_alias_map[last_default_alias]
                        file_alias_map[alias] = last_fqn

            for capture_name, node in captures:
                if not node.text:
                    continue

                target_class = None

                if capture_name in ("class.extends", "class.implements", "instantiation.class"):
                    target_class = node.text.decode('utf8')

                elif capture_name == "static.class":
                    target_class = node.text.decode('utf8')
                    if target_class[0].islower() or target_class in ("self", "static", "parent"):
                        continue

                elif capture_name == "use.fqn":
                    fqn = node.text.decode('utf8')
                    target_path = self._fqn_to_path(fqn, psr4_map)
                    if target_path:
                        edges.append({
                            "source_id": f"file:{rel_path}",
                            "target_id": f"file:{target_path}",
                            "type": "depends_on"
                        })
                    continue

                if target_class:
                    if target_class.startswith('\\'):
                        continue

                    fqn = self._resolve_fqn(target_class, file_alias_map, current_namespace)
                    target_path = self._fqn_to_path(fqn, psr4_map)

                    if target_path:
                        edges.append({
                            "source_id": f"file:{rel_path}",
                            "target_id": f"file:{target_path}",
                            "type": "depends_on"
                        })

        unique_edges = {f"{e['source_id']}->{e['target_id']}": e for e in edges}

        return {
            "nodes": nodes,
            "edges": list(unique_edges.values())
        }
