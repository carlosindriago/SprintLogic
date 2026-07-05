import re
from pathlib import Path
from typing import Any

PATTERNS: list[tuple[str, str]] = [
    # TS/JS: class, function, const, let, var, arrow, type, interface, enum
    (
        "typescript",
        r"^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:class|function|const|let|var)\s+([a-zA-Z0-9_$]+)",
    ),
    ("typescript", r"^\s*(?:export\s+)?(?:type|interface|enum)\s+([a-zA-Z0-9_$]+)"),
    ("typescript", r"^\s*(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*[:=]"),
    # Python: def, class, async def
    ("python", r"^\s*(?:async\s+)?(?:def|class)\s+([a-zA-Z0-9_]+)"),
    # Rust: fn, struct, enum, trait, impl, mod, const, static
    (
        "rust",
        r"^\s*(?:pub\s+)?(?:async\s+)?(?:unsafe\s+)?(?:fn|struct|enum|trait|impl|mod|const|static)\s+([a-zA-Z0-9_]+)",
    ),
    # Go: func, type, var, const
    ("golang", r"^\s*(?:func|type|var|const)\s+(?:\([^)]*\)\s+)?([a-zA-Z0-9_]+)"),
    # Java/PHP: class, interface, enum, function
    (
        "other",
        r"^\s*(?:(?:public|private|protected|static|final|abstract)\s+)*(?:class|interface|enum|function)\s+([a-zA-Z0-9_]+)",
    ),
]

EXT_TO_LANG: dict[str, str] = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "typescript",
    ".jsx": "typescript",
    ".py": "python",
    ".rs": "rust",
    ".go": "golang",
    ".java": "other",
    ".php": "other",
}


def extract_symbols(file_path: str, content: str) -> list[dict[str, Any]]:
    ext = Path(file_path).suffix.lower()
    lang = EXT_TO_LANG.get(ext)
    if not lang:
        return []

    results: list[dict[str, Any]] = []
    seen: set[str] = set()

    for lang_match, pattern in PATTERNS:
        if lang_match != lang:
            continue
        for m in re.finditer(pattern, content, re.MULTILINE):
            name = m.group(1)
            if name in seen:
                continue
            seen.add(name)
            line = content[: m.start()].count("\n") + 1
            results.append({"name": name, "line": line})

    return results
