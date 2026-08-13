import os
from pathlib import Path


def _build_tree(root_path: str, max_depth: int = 2) -> str:
    """Builds a simple textual directory tree up to max_depth."""
    tree_lines = []
    root_path_obj = Path(root_path)
    ignore_dirs = {
        ".git",
        "node_modules",
        ".venv",
        "venv",
        "test_env",
        "dist",
        "build",
        "__pycache__",
        "target",
        ".gradle",
        ".idea",
        "vendor",
        "coverage",
        "out",
    }

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


def build_awareness_xml(
    project_path: str,
    project_type: str,
    core_tech: set[str],
    total_files: int,
    topological_map_md: str = "",
) -> str:
    """Builds the final XML block for the project scanner."""
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
    ]

    if topological_map_md:
        xml_lines.extend(["  <topological_map>", topological_map_md, "  </topological_map>"])

    xml_lines.append("</PROJECT_AWARENESS>")
    return "\n".join(xml_lines)
