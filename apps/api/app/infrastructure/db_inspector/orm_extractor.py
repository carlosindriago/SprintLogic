import json
import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models.schema_ir import SchemaIR
from app.infrastructure.llm.litellm_gateway import LiteLLMGateway
from app.infrastructure.repositories import prompt_repository
from app.infrastructure.repositories.tool_model_repository import (
    resolve_tool_model,
    tool_model_label,
)

logger = logging.getLogger(__name__)

MAX_SOURCE_CHARS = 20000


EXCLUDE_DIRS = {".git", ".venv", "venv", "node_modules", "vendor", "dist", "build", "__pycache__"}


def collect_orm_source_code(project_path: str, framework: str) -> str:
    """
    Collects relevant ORM schema and migration source code for the given framework,
    capping total character length to MAX_SOURCE_CHARS.
    """
    root = Path(project_path)
    snippets: list[str] = []
    total_chars = 0

    files_to_read: list[Path] = []

    if framework == "laravel":
        migrations_dir = root / "database" / "migrations"
        if migrations_dir.exists() and migrations_dir.is_dir():
            files_to_read.extend(sorted(migrations_dir.glob("*.php")))
        else:
            for p in root.rglob("database/migrations"):
                if not any(part in EXCLUDE_DIRS for part in p.parts):
                    files_to_read.extend(sorted(p.glob("*.php")))

        models_dir = root / "app" / "Models"
        if models_dir.exists() and models_dir.is_dir():
            files_to_read.extend(sorted(models_dir.glob("*.php")))
        else:
            for p in root.rglob("app/Models"):
                if not any(part in EXCLUDE_DIRS for part in p.parts):
                    files_to_read.extend(sorted(p.glob("*.php")))

    elif framework == "prisma":
        prisma_schema = root / "prisma" / "schema.prisma"
        if prisma_schema.exists():
            files_to_read.append(prisma_schema)
        else:
            for p in root.rglob("schema.prisma"):
                if not any(part in EXCLUDE_DIRS for part in p.parts):
                    files_to_read.append(p)

    elif framework == "django":
        for p in root.rglob("models.py"):
            if not any(part in EXCLUDE_DIRS for part in p.parts):
                files_to_read.append(p)

    elif framework == "flutter":
        for folder in ["lib/database", "lib/models", "lib/data"]:
            target_dir = root.joinpath(*folder.split("/"))
            if target_dir.exists():
                for p in target_dir.rglob("*.dart"):
                    if not any(part in EXCLUDE_DIRS for part in p.parts):
                        files_to_read.append(p)
        for p in root.rglob("*.drift"):
            if not any(part in EXCLUDE_DIRS for part in p.parts):
                files_to_read.append(p)

    for fpath in files_to_read:
        if total_chars >= MAX_SOURCE_CHARS:
            break
        try:
            content = fpath.read_text(encoding="utf-8", errors="ignore").strip()
            if not content:
                continue
            header = f"\n--- File: {fpath.relative_to(root)} ---\n"
            chunk = header + content
            if total_chars + len(chunk) > MAX_SOURCE_CHARS:
                available = MAX_SOURCE_CHARS - total_chars - len(header)
                if available > 200:
                    chunk = header + content[:available] + "\n...[truncated]"
                else:
                    break
            snippets.append(chunk)
            total_chars += len(chunk)
        except Exception as e:
            logger.warning("Error reading file %s for ORM extraction: %s", fpath, e)

    return "\n".join(snippets)


async def extract_schema_from_orm(
    project_path: str, framework: str, session: AsyncSession
) -> SchemaIR:
    """
    Reads ORM/migration source code for a framework and uses LLM to parse it into SchemaIR.
    """
    source_code = collect_orm_source_code(project_path, framework)
    if not source_code.strip():
        logger.warning("No source code found for framework %s in %s", framework, project_path)
        return SchemaIR(
            tables=[], orm_type=framework, extraction_level="orm", detected_framework=framework
        )

    # 1. Fetch prompt template
    prompt_model = await prompt_repository.get_prompt_async(
        session, prompt_repository.ORM_SCHEMA_EXTRACTOR_ID
    )
    prompt_template = (
        prompt_model.content if prompt_model else prompt_repository.ORM_SCHEMA_EXTRACTOR_CONTENT
    )

    formatted_prompt = prompt_template.replace("{framework}", framework).replace(
        "{source_code}", source_code
    )

    # 2. Resolve LLM model
    resolved_label = "default"
    fallbacks = None
    try:
        provider, model_id, fallbacks = await resolve_tool_model(session, "database_studio")
        resolved_label = tool_model_label(provider, model_id)
        gateway = LiteLLMGateway(model_name=resolved_label)
    except Exception as e:
        logger.warning("Falling back to default LiteLLM gateway for ORM extraction: %s", e)
        gateway = LiteLLMGateway()

    # 3. Call LLM
    try:
        raw_response = await gateway.generate_completion(formatted_prompt, fallbacks=fallbacks)
    except Exception as llm_err:
        logger.error("LLM ORM schema extraction failed: %s", llm_err, exc_info=True)
        with open("/tmp/db_studio_error.log", "w") as f:
            f.write(f"LLM Failure: {str(llm_err)}\n")
        return SchemaIR(
            tables=[], orm_type=framework, extraction_level="orm", detected_framework=framework
        )

    # 4. Clean Markdown formatting & Backticks (Strict Guardrail)
    with open("/tmp/db_studio.log", "a") as f:
        f.write(f"LLM Success Raw response: {raw_response}\n")

    cleaned = raw_response.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("\n", 1)[0]
    cleaned = cleaned.strip()
    if cleaned.startswith("json"):
        cleaned = cleaned[4:].strip()

    # 5. Parse JSON into SchemaIR
    try:
        parsed_dict = json.loads(cleaned)
        schema = SchemaIR.model_validate(parsed_dict)
        schema.extraction_level = "orm"
        schema.detected_framework = framework
        schema.orm_type = framework
        return schema
    except Exception as parse_err:
        logger.warning("Failed to parse JSON response for ORM schema extraction: %s", parse_err)
        with open("/tmp/db_studio.log", "a") as f:
            f.write(f"JSON Parse failed: {str(parse_err)}\nRaw response: {raw_response}\n")
        return SchemaIR(
            tables=[], orm_type=framework, extraction_level="orm", detected_framework=framework
        )
