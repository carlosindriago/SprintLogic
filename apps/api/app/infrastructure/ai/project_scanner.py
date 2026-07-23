import asyncio
import json
import os
import time
from pathlib import Path

# Cache to avoid hammering the disk
# Key: project_path, Value: (timestamp, xml_result)
_SCAN_CACHE: dict[str, tuple[float, str]] = {}
_CACHE_TTL_SECONDS = 60


def _build_tree(root_path: str, max_depth: int = 2) -> str:
    """Builds a simple textual directory tree up to max_depth."""
    tree_lines = []
    root_path_obj = Path(root_path)
    ignore_dirs = {".git", "node_modules", ".venv", "venv", "test_env", "dist", "build", "__pycache__", "target", ".gradle", ".idea", "vendor", "coverage", "out"}

    for dirpath, dirnames, filenames in os.walk(root_path):
        # Filter directories in-place
        dirnames[:] = [d for d in dirnames if d not in ignore_dirs and not d.startswith(".")]

        rel_path = os.path.relpath(dirpath, root_path)
        if rel_path == ".":
            depth = 0
            tree_lines.append(root_path_obj.name or ".")
        else:
            depth = rel_path.count(os.sep) + 1
            if depth > max_depth:
                # Clear dirnames so it doesn't descend further
                dirnames[:] = []
                continue
            indent = "  " * depth
            tree_lines.append(f"{indent}- {os.path.basename(dirpath)}/")

            # Show files if we are at the max depth or below
            if depth <= max_depth:
                file_count = 0
                for f in filenames:
                    if not f.startswith("."):
                        file_count += 1
                        if file_count <= 3:  # Show up to 3 files per dir
                            tree_lines.append(f"{indent}  - {f}")
                if file_count > 3:
                    tree_lines.append(f"{indent}  ... (+{file_count - 3} files)")

    return "\n".join(tree_lines)


def _scan_blocking(project_path: str) -> str:
    """
    Synchronous blocking function to scan the project.
    Must be run in a separate thread.
    """
    if not os.path.isdir(project_path):
        return "<PROJECT_AWARENESS>\n  <error>Project path not found</error>\n</PROJECT_AWARENESS>"

    total_files = 0
    ignore_dirs = {".git", "node_modules", ".venv", "venv", "test_env", "dist", "build", "__pycache__", "target", ".gradle", ".idea", "vendor", "coverage", "out"}
    core_tech = set()
    project_type = "Unknown"

    for dirpath, dirnames, filenames in os.walk(project_path):
        # Filter directories in-place to avoid descending into them
        dirnames[:] = [d for d in dirnames if d not in ignore_dirs and not d.startswith(".")]

        for f in filenames:
            if f.startswith("."):
                continue
            total_files += 1

            if f == "package.json":
                try:
                    with open(os.path.join(dirpath, f), encoding="utf-8") as pkg:
                        data = json.load(pkg)
                        deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
                        if "react" in deps:
                            core_tech.add("React")
                        if "next" in deps:
                            core_tech.add("Next.js")
                        if "vue" in deps:
                            core_tech.add("Vue")
                        if "@angular/core" in deps:
                            core_tech.add("Angular")
                        if "tailwindcss" in deps:
                            core_tech.add("TailwindCSS")
                        if "typescript" in deps:
                            core_tech.add("TypeScript")
                except Exception:
                    pass
            elif f == "angular.json":
                core_tech.add("Angular")
            elif f == "pyproject.toml" or f == "requirements.txt":
                core_tech.add("Python")
                if "pyproject.toml" in filenames:
                    try:
                        with open(os.path.join(dirpath, "pyproject.toml"), encoding="utf-8") as toml:
                            content = toml.read()
                            if "fastapi" in content:
                                core_tech.add("FastAPI")
                            if "django" in content:
                                core_tech.add("Django")
                            if "sqlalchemy" in content:
                                core_tech.add("SQLAlchemy")
                    except Exception:
                        pass
            elif f == "pom.xml" or f == "build.gradle":
                core_tech.add("Java")
                if "pom.xml" == f:
                    try:
                        with open(os.path.join(dirpath, f), encoding="utf-8") as pom:
                            content = pom.read()
                            if "spring-boot" in content:
                                core_tech.add("Spring Boot")
                    except Exception:
                        pass
            elif f == "tauri.conf.json":
                core_tech.add("Tauri")
                core_tech.add("Rust")
            elif f == "Cargo.toml":
                core_tech.add("Rust")
            elif f == "go.mod":
                core_tech.add("Go")

    # Determine Project Type based on detected core_tech
    if "Java" in core_tech and ("Angular" in core_tech or "React" in core_tech or "Vue" in core_tech):
        project_type = "Monorepo (Java + Frontend)"
    elif "Python" in core_tech and ("Angular" in core_tech or "React" in core_tech or "Vue" in core_tech):
        project_type = "Monorepo (Python + Frontend)"
    elif "Java" in core_tech:
        project_type = "Java / JVM"
    elif "Python" in core_tech:
        project_type = "Python"
    elif "Tauri" in core_tech:
        project_type = "Tauri App"
    elif "Angular" in core_tech or "React" in core_tech or "Vue" in core_tech or "Next.js" in core_tech:
        project_type = "Node.js / Web"

    if not core_tech:
        core_tech.add("Generic")

    tree_str = _build_tree(project_path, max_depth=2)
    name = os.path.basename(os.path.normpath(project_path))

    xml_lines = [
        "<PROJECT_AWARENESS>",
        f"  <name>{name}</name>",
        f"  <type>{project_type}</type>",
        f"  <core_tech>{', '.join(sorted(list(core_tech)))}</core_tech>",
        f"  <size>{total_files} files (excluding dependencies)</size>",
        "  <root_structure>",
        tree_str,
        "  </root_structure>",
        "</PROJECT_AWARENESS>"
    ]
    return "\n".join(xml_lines)


async def get_project_awareness_xml(project_path: str | None) -> str:
    """
    Returns an XML block summarizing the project structure and tech stack.
    Delegates the heavy I/O to a background thread to prevent blocking the Event Loop.
    Includes caching to avoid hammering the disk.
    """
    if not project_path:
        return ""

    now = time.time()

    # Check cache
    if project_path in _SCAN_CACHE:
        timestamp, result = _SCAN_CACHE[project_path]
        if now - timestamp < _CACHE_TTL_SECONDS:
            return result

    # Delegate blocking I/O to thread pool
    result = await asyncio.to_thread(_scan_blocking, project_path)

    # Update cache
    _SCAN_CACHE[project_path] = (now, result)

    return result
