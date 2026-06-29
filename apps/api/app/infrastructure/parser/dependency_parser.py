import json
import tomllib
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.db.models import ContextSnippetModel

async def parse_dependencies(repo_id: int, repo_path: str, session: AsyncSession) -> None:
    """Parses package.json and pyproject.toml and stores dependencies as ContextSnippets."""
    base_path = Path(repo_path)
    snippets = []

    # Parse package.json
    for pjson in base_path.rglob("package.json"):
        if "node_modules" in pjson.parts:
            continue
        try:
            with open(pjson, "r", encoding="utf-8") as f:
                data = json.load(f)
                deps = data.get("dependencies", {})
                dev_deps = data.get("devDependencies", {})
                
                content = f"File: {pjson.relative_to(base_path)}\n"
                content += "Dependencies:\n" + "\n".join([f"- {k}: {v}" for k, v in deps.items()]) + "\n"
                content += "DevDependencies:\n" + "\n".join([f"- {k}: {v}" for k, v in dev_deps.items()])
                
                snippets.append(ContextSnippetModel(
                    project_id=repo_id,
                    type="dependency",
                    content=content
                ))
        except Exception:
            pass

    # Parse pyproject.toml
    for ptoml in base_path.rglob("pyproject.toml"):
        if ".venv" in ptoml.parts or "venv" in ptoml.parts:
            continue
        try:
            with open(ptoml, "rb") as f:
                data = tomllib.load(f)
                content = f"File: {ptoml.relative_to(base_path)}\n"
                
                # Check for standard project.dependencies
                project_data = data.get("project", {})
                deps = project_data.get("dependencies", [])
                if deps:
                    content += "Dependencies:\n" + "\n".join([f"- {d}" for d in deps]) + "\n"
                    
                # Check for poetry
                poetry_data = data.get("tool", {}).get("poetry", {})
                p_deps = poetry_data.get("dependencies", {})
                if p_deps:
                    content += "Poetry Dependencies:\n" + "\n".join([f"- {k}: {v}" for k, v in p_deps.items()]) + "\n"
                    
                snippets.append(ContextSnippetModel(
                    project_id=repo_id,
                    type="dependency",
                    content=content
                ))
        except Exception:
            pass

    if snippets:
        session.add_all(snippets)
        await session.commit()
