import json
import logging
import os

logger = logging.getLogger(__name__)

def parse_project_files(project_path: str) -> tuple[int, set[str]]:
    """Walks the directory and parses files to detect technologies."""
    total_files = 0
    ignore_dirs = {".git", "node_modules", ".venv", "venv", "test_env", "dist", "build", "__pycache__", "target", ".gradle", ".idea", "vendor", "coverage", "out"}
    core_tech = set()

    for dirpath, dirnames, filenames in os.walk(project_path):
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
                    logger.debug("Unhandled exception", exc_info=True)
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
                        logger.debug("Unhandled exception", exc_info=True)
            elif f == "pom.xml" or f == "build.gradle":
                core_tech.add("Java")
                if "pom.xml" == f:
                    try:
                        with open(os.path.join(dirpath, f), encoding="utf-8") as pom:
                            content = pom.read()
                            if "spring-boot" in content:
                                core_tech.add("Spring Boot")
                    except Exception:
                        logger.debug("Unhandled exception", exc_info=True)
            elif f == "tauri.conf.json":
                core_tech.add("Tauri")
                core_tech.add("Rust")
            elif f == "Cargo.toml":
                core_tech.add("Rust")
            elif f == "go.mod":
                core_tech.add("Go")

    return total_files, core_tech
