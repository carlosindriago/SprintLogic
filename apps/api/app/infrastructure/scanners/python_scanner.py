import json
import subprocess
from pathlib import Path
from typing import Any

from app.infrastructure.scanners.base import ProjectScanner

# Ruff severity mapping → Monaco MarkerSeverity
# Ruff: "error" | "warning" | "information" | "hint"
# Monaco: Hint=1, Info=2, Warning=4, Error=8
RUFF_TO_MONACO: dict[str, int] = {
    "error": 8,
    "warning": 4,
    "information": 2,
    "hint": 1,
}


class PythonScanner(ProjectScanner):
    def scan(self, project_path: str) -> dict[str, list[dict[str, Any]]]:
        root = Path(project_path).resolve()

        try:
            result = subprocess.run(
                [
                    "ruff",
                    "check",
                    str(root),
                    "--output-format=json",
                ],
                capture_output=True,
                text=True,
                timeout=60,
            )
        except FileNotFoundError:
            return {}
        except subprocess.TimeoutExpired:
            return {}

        # ruff exits 0 = no issues, 1 = issues found (not an error),
        # 2 = ruff itself errored (bad config, etc.)
        if result.returncode == 2:
            return {}

        try:
            issues: list[dict[str, Any]] = json.loads(result.stdout or "[]")
        except json.JSONDecodeError:
            return {}

        markers: dict[str, list[dict[str, Any]]] = {}

        for issue in issues:
            filename = issue.get("filename", "")
            if not filename:
                continue

            absolute = str(root / filename)

            line = issue.get("location", {}).get("row", 1)
            column = issue.get("location", {}).get("column", 1)
            message = issue.get("message", "")
            code = issue.get("code", "")
            severity_label = issue.get("severity", "error")

            if code:
                message = f"{code}: {message}"

            marker = {
                "line": line,
                "column": column,
                "message": message,
                "severity": RUFF_TO_MONACO.get(severity_label, 8),
            }

            markers.setdefault(absolute, []).append(marker)

        return markers
