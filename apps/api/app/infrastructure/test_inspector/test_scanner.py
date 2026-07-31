import os
from pathlib import Path
from typing import TypedDict


class TestDiscoveryItem(TypedDict):
    file_path: str
    has_test: bool
    test_file_path: str | None

GLOBAL_IGNORED_DIRS = {"vendor", "node_modules", ".venv", "bin", "obj", "target", ".git", "build", "dist"}

def scan_project_tests(project_path: str) -> list[TestDiscoveryItem]:
    """
    Escanea el árbol del proyecto utilizando heurísticas agnósticas al lenguaje
    para encontrar archivos fuente y sus correspondientes archivos de test.
    """
    results: list[TestDiscoveryItem] = []
    root = Path(project_path)

    if not root.exists() or not root.is_dir():
        return results

    # Recolectar todos los archivos para búsquedas rápidas de test
    all_files = []
    for dirpath, dirnames, filenames in os.walk(project_path):
        # Filtrar directorios ignorados in-place
        dirnames[:] = [d for d in dirnames if d not in GLOBAL_IGNORED_DIRS]
        for f in filenames:
            all_files.append(Path(dirpath) / f)

    # Convertir a cadenas relativas para facilitar la búsqueda
    relative_files = [f.relative_to(root).as_posix() for f in all_files]
    test_files_set = set(relative_files)

    for rel_file in relative_files:
        path_obj = Path(rel_file)
        parts = path_obj.parts
        name = path_obj.name
        ext = path_obj.suffix

        # Ignorar autogenerados de Flutter
        if ext == ".dart" and (name.endswith(".g.dart") or name.endswith(".freezed.dart")):
            continue

        # Ignorar migraciones y seeders de PHP
        if ext == ".php" and any(p in ("migrations", "seeders") for p in parts):
            continue

        # Evitar procesar archivos que en sí mismos ya son tests para no contarlos como fuentes sin test
        if name.endswith("Test.php") or name.endswith("Test.java") or name.endswith("_test.go") or \
           name.startswith("test_") or name.endswith(".spec.ts") or name.endswith(".test.js") or \
           name.endswith(".test.ts") or name.endswith(".spec.js") or name.endswith("Tests.cs") or \
           name.endswith("_test.dart"):
            continue

        test_path: str | None = None
        is_source = False

        # --- HEURÍSTICAS MULTI-LENGUAJE ---

        # PHP (Laravel/Symfony): app/ o src/ -> tests/**/*Test.php
        if ext == ".php" and len(parts) > 0 and parts[0] in ("app", "src"):
            is_source = True
            expected_test_name = path_obj.stem + "Test.php"
            # Buscar en la carpeta tests/
            for t_file in test_files_set:
                if t_file.startswith("tests/") and t_file.endswith(expected_test_name):
                    test_path = t_file
                    break

        # Java (Spring Boot): src/main/java/ -> src/test/java/**/*Test.java
        elif ext == ".java" and len(parts) >= 3 and parts[0] == "src" and parts[1] == "main" and parts[2] == "java":
            is_source = True
            expected_test_name = path_obj.stem + "Test.java"
            for t_file in test_files_set:
                if t_file.startswith("src/test/java/") and t_file.endswith(expected_test_name):
                    test_path = t_file
                    break

        # Go: *.go -> *_test.go
        elif ext == ".go":
            is_source = True
            expected_test_name = path_obj.stem + "_test.go"
            # Go suele poner el test en el mismo directorio
            expected_full_path = str(path_obj.parent / expected_test_name)
            if expected_full_path == ".":
                expected_full_path = expected_test_name

            if expected_full_path in test_files_set:
                test_path = expected_full_path
            else:
                # Fallback: buscar en cualquier lado
                for t_file in test_files_set:
                    if t_file.endswith("/" + expected_test_name) or t_file == expected_test_name:
                        test_path = t_file
                        break

        # Python (FastAPI/Django): *.py -> tests/test_*.py
        elif ext == ".py":
            # Excluir archivos dunder y configuración root común
            if name.startswith("__") or name in ("setup.py", "conftest.py", "manage.py"):
                continue

            # No restringir por carpeta para Python source, pero evitar tests
            if "tests" not in parts and "test" not in parts:
                is_source = True
                expected_test_name = "test_" + name
                for t_file in test_files_set:
                    if ("tests/" in t_file or "test/" in t_file) and t_file.endswith("/" + expected_test_name):
                        test_path = t_file
                        break

        # JS/TS (Node/React): src/ o lib/ -> *.spec.ts / *.test.js
        elif ext in (".js", ".ts", ".jsx", ".tsx"):
            if len(parts) > 0 and parts[0] in ("src", "lib"):
                is_source = True
                stem = path_obj.stem
                # Check for .test or .spec with same extension
                for t_file in test_files_set:
                    if t_file.endswith(f"/{stem}.test{ext}") or t_file.endswith(f"/{stem}.spec{ext}") or \
                       (len(Path(t_file).parts) == 1 and (t_file == f"{stem}.test{ext}" or t_file == f"{stem}.spec{ext}")):
                        test_path = t_file
                        break

        # C# (.NET): *.cs -> *Tests.cs
        elif ext == ".cs":
            is_source = True
            expected_test_name = path_obj.stem + "Tests.cs"
            for t_file in test_files_set:
                if t_file.endswith("/" + expected_test_name) or t_file == expected_test_name:
                    test_path = t_file
                    break

        # Dart (Flutter): lib/ -> test/**/*_test.dart
        elif ext == ".dart" and len(parts) > 0 and parts[0] == "lib":
            is_source = True
            expected_test_name = path_obj.stem + "_test.dart"
            for t_file in test_files_set:
                if t_file.startswith("test/") and t_file.endswith(expected_test_name):
                    test_path = t_file
                    break

        if is_source:
            results.append({
                "file_path": rel_file,
                "has_test": test_path is not None,
                "test_file_path": test_path
            })

    # Sort results by tested first, then alphabetically
    results.sort(key=lambda x: (not x["has_test"], x["file_path"]))
    return results
