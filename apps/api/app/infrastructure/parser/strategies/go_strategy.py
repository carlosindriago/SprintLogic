import logging
import re
from pathlib import Path
from typing import Any

import tree_sitter_go as tsgo
from tree_sitter import Language, Parser

from app.domain.ports.language_analyzer import LanguageAnalyzerStrategy

logger = logging.getLogger(__name__)


class GoAnalyzerStrategy(LanguageAnalyzerStrategy):
    """
    Two-Pass Semantic Parser para Go usando Tree-sitter.
    Evita los falsos positivos mapeando de forma determinista
    el string de importación hacia la carpeta física y luego al nombre real del paquete.
    """

    def __init__(self) -> None:
        try:
            self.go_language = Language(tsgo.language())
            self.parser = Parser()
            self.parser.language = self.go_language
            self._compile_queries()
        except Exception as e:
            logger.error(f"Fallo al cargar tree-sitter-go: {e}")
            raise

    def _compile_queries(self) -> None:
        from tree_sitter import Query
        self.pass1_query = Query(self.go_language,
            """
            (package_clause (package_identifier) @pkg.name)
            (function_declaration name: (identifier) @func.name)
            (method_declaration name: (field_identifier) @method.name)
            (type_declaration (type_spec name: (type_identifier) @type.name))
            (var_declaration (var_spec name: (identifier) @var.name))
            """
        )

        self.pass2_query = Query(self.go_language,
            """
            (import_spec name: (package_identifier) @import.alias path: (interpreted_string_literal) @import.path)
            (import_spec path: (interpreted_string_literal) @import.path)
            
            (call_expression function: (identifier) @call.local)
            
            (call_expression
              function: (selector_expression
                operand: (identifier) @call.pkg_or_obj
                field: (field_identifier) @call.field
              )
            )
            
            (type_identifier) @type.use
            """
        )

    def is_compatible(self, project_path: Path) -> bool:
        return bool(list(project_path.rglob("*.go"))) and (project_path / "go.mod").exists()

    def _extract_module_prefix(self, project_path: Path) -> str:
        go_mod = project_path / "go.mod"
        if not go_mod.exists():
            return ""
        content = go_mod.read_text(encoding="utf-8")
        match = re.search(r"^module\s+([^\s]+)", content, re.MULTILINE)
        return match.group(1) if match else ""

    async def parse_dependencies(self, project_path: Path) -> dict[str, Any]:
        module_prefix = self._extract_module_prefix(project_path)
        if not module_prefix:
            logger.warning("No se pudo extraer el módulo de go.mod, los imports internos podrían fallar.")

        nodes = []
        edges = []

        # Estructuras de Indexación (Pass 1)
        # folder_to_pkg["internal/db"] -> "database"
        folder_to_pkg: dict[str, str] = {}
        # symbol_table[("database", "Connect")] -> ["internal/db/mysql.go"]
        symbol_table: dict[tuple[str, str], list[str]] = {}

        go_files = []
        for filepath in project_path.rglob("*.go"):
            if "vendor" in filepath.parts or "node_modules" in filepath.parts or filepath.name.endswith("_test.go"):
                continue
            go_files.append(filepath)

        # ---------------------------------------------------------
        # PASS 1: Indexador (Construyendo la Tabla de Símbolos)
        # ---------------------------------------------------------
        parsed_trees = {}
        for filepath in go_files:
            rel_path = filepath.relative_to(project_path).as_posix()
            folder_rel_path = filepath.parent.relative_to(project_path).as_posix()
            if folder_rel_path == ".":
                folder_rel_path = ""

            nodes.append({
                "id": f"file:{rel_path}",
                "label": filepath.name,
                "type": "file",
                "language": "go",
                "file_path": rel_path
            })

            code = filepath.read_bytes()
            tree = self.parser.parse(code)
            parsed_trees[rel_path] = tree

            from tree_sitter import QueryCursor
            cursor = QueryCursor(self.pass1_query)
            current_package = ""

            for pattern_index, captures_dict in cursor.matches(tree.root_node):
                for capture_name, nodes_list in captures_dict.items():
                    for node in nodes_list:
                        if not node.text:
                            continue
                        if capture_name == "pkg.name":
                            current_package = node.text.decode('utf8')
                            folder_to_pkg[folder_rel_path] = current_package
                        else:
                            if not current_package:
                                continue
                            symbol = node.text.decode('utf8')
                            key = (folder_rel_path, symbol)
                            if key not in symbol_table:
                                symbol_table[key] = []
                            symbol_table[key].append(f"file:{rel_path}")

        # ---------------------------------------------------------
        # PASS 2: Enlazador (Dibujando Flechas Reales)
        # ---------------------------------------------------------
        for filepath in go_files:
            rel_path = filepath.relative_to(project_path).as_posix()
            folder_rel_path = filepath.parent.relative_to(project_path).as_posix()
            if folder_rel_path == ".":
                folder_rel_path = ""
                
            my_package = folder_to_pkg.get(folder_rel_path, "")
            tree = parsed_trees[rel_path]
            
            cursor = QueryCursor(self.pass2_query)
            # Diccionario temporal del archivo para mapear alias -> package_name_real
            file_alias_map: dict[str, str] = {}

            for pattern_index, captures_dict in cursor.matches(tree.root_node):
                for capture_name, nodes_list in captures_dict.items():
                    for node in nodes_list:
                        if not node.text:
                            continue
                        if capture_name == "import.path":
                            # El import literal tiene comillas (ej. '"github.com/carlos/sprintlogic/internal/db"')
                            import_str = node.text.decode('utf8').strip('"')
                            
                            if module_prefix and import_str.startswith(module_prefix):
                                # Import interno! Quitamos el prefijo
                                # Si el module es 'github.com/my/proj', y el import es 'github.com/my/proj/pkg'
                                target_folder = import_str[len(module_prefix):].strip('/')
                                
                                target_pkg_name = folder_to_pkg.get(target_folder)
                                if target_pkg_name:
                                    # Por defecto, el alias es la última parte de la ruta
                                    default_alias = target_folder.split('/')[-1]
                                    # Mapeamos alias -> RUTA FISICA DE LA CARPETA (la clave infalible)
                                    file_alias_map[default_alias] = target_folder
                                    
                        elif capture_name == "import.alias":
                            # Si capturamos un alias, deberíamos vincularlo al import path siguiente.
                            pass 
        
                        elif capture_name == "call.local":
                            symbol = node.text.decode('utf8')
                            # Llamada implícita, buscamos en nuestra propia carpeta
                            targets = symbol_table.get((folder_rel_path, symbol), [])
                            for tgt in targets:
                                if tgt != f"file:{rel_path}":  # No aristas a sí mismo
                                    edges.append({
                                        "source_id": f"file:{rel_path}",
                                        "target_id": tgt,
                                        "type": "calls"
                                    })
        
                        elif capture_name == "call.field":
                            # Si es pkg.Call(), `call.field` es Call, y `call.pkg_or_obj` fue el nodo anterior.
                            parent = node.parent
                            if parent and parent.type == "selector_expression":
                                operand = parent.child_by_field_name("operand")
                                if operand and operand.text:
                                    alias = operand.text.decode('utf8')
                                    symbol = node.text.decode('utf8')
                                    
                                    # ¿Es un alias de paquete conocido?
                                    if alias in file_alias_map:
                                        target_folder = file_alias_map[alias]
                                        targets = symbol_table.get((target_folder, symbol), [])
                                        for tgt in targets:
                                            edges.append({
                                                "source_id": f"file:{rel_path}",
                                                "target_id": tgt,
                                                "type": "calls"
                                            })
                                    # También podría ser una llamada a método en el mismo paquete (ej. miObj.Metodo)
                                    else:
                                        targets = symbol_table.get((folder_rel_path, symbol), [])
                                        for tgt in targets:
                                            if tgt != f"file:{rel_path}":
                                                edges.append({
                                                    "source_id": f"file:{rel_path}",
                                                    "target_id": tgt,
                                                    "type": "calls"
                                                })

        return {"nodes": nodes, "edges": edges}


