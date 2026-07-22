import json
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

CANDIDATE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"]

def strip_json_comments(text: str) -> str:
    """Remueve comentarios // de una línea (no dentro de strings)"""
    return re.sub(r'^\s*//.*?$', '', text, flags=re.MULTILINE)

def try_resolve_file(base_path: str, file_set: set[str]) -> str | None:
    """Intenta resolver una ruta base a un archivo real probando extensiones y archivos index"""
    # 1. Exact match (already has extension)
    if base_path in file_set:
        return base_path
    
    # 2. Try each extension
    for ext in CANDIDATE_EXTS:
        candidate = base_path + ext
        if candidate in file_set:
            return candidate
            
    # 3. Try index files (directory import)
    for ext in CANDIDATE_EXTS:
        candidate = base_path + "/index" + ext
        if candidate in file_set:
            return candidate
            
    return None

def is_external_import(imp: str, alias_prefixes: list[str]) -> bool:
    """Determina si un import es a node_modules o es interno"""
    if imp.startswith("./") or imp.startswith("../"):
        return False
    for prefix in alias_prefixes:
        if imp.startswith(prefix):
            return False
    # If it's a bare import without known aliases, we consider it external (e.g. 'react', 'next')
    return True

class TSConfigResolver:
    def __init__(self, file_paths: list[str]):
        self.paths: dict[str, list[str]] = {}
        self.base_url: str | None = None
        self.tsconfig_dir: str | None = None
        self.alias_prefixes: list[str] = []
        self.file_set = set(file_paths)
        self._parse_configs(file_paths)

    def _parse_configs(self, file_paths: list[str]):
        # Encontrar el primer tsconfig.json válido
        for fp in file_paths:
            if fp.endswith("tsconfig.json"):
                self.tsconfig_dir = str(Path(fp).parent)
                try:
                    with open(fp, "r", encoding="utf-8") as f:
                        content = f.read()
                        clean_content = strip_json_comments(content)
                        # También remover posibles trailing commas para evitar fallos en json.loads
                        clean_content = re.sub(r',\s*}', '}', clean_content)
                        clean_content = re.sub(r',\s*\]', ']', clean_content)
                        
                        config = json.loads(clean_content)
                        compiler_options = config.get("compilerOptions", {})
                        
                        self.base_url = compiler_options.get("baseUrl")
                        raw_paths = compiler_options.get("paths", {})
                        
                        for alias, targets in raw_paths.items():
                            if isinstance(targets, list) and len(targets) > 0:
                                # Normalizar alias (ej: '@/*' -> '@/')
                                clean_alias = alias.replace("*", "")
                                clean_target = targets[0].replace("*", "")
                                self.paths[clean_alias] = [clean_target]
                                self.alias_prefixes.append(clean_alias)
                except Exception as e:
                    logger.warning(f"Error parsing tsconfig.json {fp}: {e}")
                
                # Si encontramos uno, nos quedamos con el primero que funcione para este proyecto
                if self.paths:
                    break

    def is_alias(self, imp: str) -> bool:
        for prefix in self.alias_prefixes:
            if imp.startswith(prefix):
                return True
        return False

    def resolve(self, imp: str) -> str | None:
        """Traduce el alias a la ruta real, y resuelve la extensión"""
        if not self.tsconfig_dir:
            return None
            
        for prefix, targets in self.paths.items():
            if imp.startswith(prefix):
                # Remover el alias del import
                suffix = imp[len(prefix):]
                target_base = targets[0] # Ej: './src/'
                
                # Base de resolución: tsconfig_dir + baseUrl (si existe)
                base_dir = Path(self.tsconfig_dir)
                if self.base_url:
                    base_dir = base_dir / self.base_url
                
                # Resolver la ruta combinando todo
                # Ej: apps/web + ./src/ + components/Button
                resolved_path = (base_dir / target_base / suffix).resolve()
                # Convertirlo a ruta relativa al CWD original, que es lo que tienen los file_paths
                try:
                    # Intentar hacerlo relativo al CWD (las rutas en file_paths asumen esto)
                    rel_path = str(resolved_path.relative_to(Path.cwd()))
                except ValueError:
                    rel_path = str(resolved_path)
                    
                # Limpiar cualquier './' extra para asegurar match limpio
                rel_path = rel_path.replace("\\", "/")
                if rel_path.startswith("./"):
                    rel_path = rel_path[2:]
                
                if not rel_path:
                    continue
                return try_resolve_file(rel_path, self.file_set)
                
        return None
