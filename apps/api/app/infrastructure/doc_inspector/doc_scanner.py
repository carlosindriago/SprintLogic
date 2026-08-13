import logging

logger = logging.getLogger(__name__)

import os
from pathlib import Path
from typing import Any

GLOBAL_IGNORED_DIRS = {
    "vendor",
    "node_modules",
    ".venv",
    "bin",
    "obj",
    "target",
    ".git",
    "build",
    "dist",
    ".idea",
    ".vscode",
}


def scan_markdown_docs(project_path: str) -> list[dict[str, Any]]:
    """
    Busca todos los archivos de documentación (.md, .mdx, .txt) ignorando carpetas muertas.
    """
    results: list[dict[str, Any]] = []
    root = Path(project_path)

    if not root.exists() or not root.is_dir():
        return results

    for dirpath, dirnames, filenames in os.walk(project_path):
        # Filtrar directorios ignorados in-place
        dirnames[:] = [d for d in dirnames if d not in GLOBAL_IGNORED_DIRS]
        for f in filenames:
            ext = Path(f).suffix.lower()
            if ext in (".md", ".mdx", ".txt"):
                full_path = Path(dirpath) / f
                rel_path = full_path.relative_to(root).as_posix()
                results.append({"file_path": rel_path})

    # Sort results placing README.md files first
    results.sort(key=lambda x: (not x["file_path"].lower().endswith("readme.md"), x["file_path"]))
    return results


def scan_undocumented_code(project_path: str) -> list[dict[str, Any]]:
    """
    Busca archivos fuente que carezcan de bloques de comentarios documentales (heurística ligera).
    """
    results: list[dict[str, Any]] = []
    root = Path(project_path)

    if not root.exists() or not root.is_dir():
        return results

    doc_signatures = {
        ".php": "/**",
        ".java": "/**",
        ".ts": "/**",
        ".js": "/**",
        ".tsx": "/**",
        ".jsx": "/**",
        ".cs": "///",
        ".dart": "///",
        ".go": "//",
        ".py": '"""',
    }

    for dirpath, dirnames, filenames in os.walk(project_path):
        dirnames[:] = [d for d in dirnames if d not in GLOBAL_IGNORED_DIRS]
        for f in filenames:
            ext = Path(f).suffix.lower()
            if ext in doc_signatures:
                # Ignorar autogenerados de Flutter
                if ext == ".dart" and (f.endswith(".g.dart") or f.endswith(".freezed.dart")):
                    continue
                # Ignorar configuraciones python
                if ext == ".py" and (
                    f in ("setup.py", "conftest.py", "manage.py") or f.startswith("__")
                ):
                    continue
                # Evitar que los archivos de tests se marquen como indocumentados
                if (
                    f.endswith("Test.php")
                    or f.endswith("Test.java")
                    or f.endswith("_test.go")
                    or f.startswith("test_")
                    or f.endswith(".spec.ts")
                    or f.endswith(".test.js")
                    or f.endswith(".test.ts")
                    or f.endswith(".spec.js")
                    or f.endswith("Tests.cs")
                    or f.endswith("_test.dart")
                ):
                    continue

                full_path = Path(dirpath) / f
                rel_path = full_path.relative_to(root).as_posix()

                try:
                    with open(full_path, encoding="utf-8") as file:
                        content = file.read()
                        if doc_signatures[ext] not in content:
                            results.append({"file_path": rel_path, "is_documented": False})
                except Exception:
                    logger.debug("Unhandled exception", exc_info=True)

    results.sort(key=lambda x: x["file_path"])
    return results
