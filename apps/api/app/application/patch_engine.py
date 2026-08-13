from pathlib import Path


def apply_patch(
    project_root: str, file_path: str, search_content: str, replace_content: str
) -> bool:
    """
    Applies a patch to a file. Validates the path to prevent traversal.
    """
    base_dir = Path(project_root).resolve()
    target_path = (base_dir / file_path).resolve()

    if not target_path.is_relative_to(base_dir):
        raise ValueError("Path traversal detected")

    if not target_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    with open(target_path, encoding="utf-8") as f:
        content = f.read()

    if search_content not in content:
        raise ValueError("Search content not found in file")

    new_content = content.replace(search_content, replace_content)

    with open(target_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    return True
