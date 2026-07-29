import logging
from pathlib import Path

logger = logging.getLogger(__name__)

EXCLUDE_DIRS = {".git", ".venv", "venv", "node_modules", "vendor", "dist", "build", "__pycache__"}


def detect_framework(project_path: str) -> str | None:
    """
    Multi-layer resilient framework detector for Laravel, Prisma, and Django.

    Step A: Manifest Inspection (composer.json, package.json, requirements.txt)
    Step B: Direct Signature Check (artisan, database/migrations, schema.prisma, manage.py)
    Step C: Flexible Recursive Search (rglob for migrations / schemas)
    """
    root = Path(project_path)
    if not root.exists() or not root.is_dir():
        return None

    # =========================================================================
    # STEP A: Manifest Inspection
    # =========================================================================
    # 1. Laravel: check composer.json
    for composer_file in root.rglob("composer.json"):
        if any(part in EXCLUDE_DIRS for part in composer_file.parts):
            continue
        try:
            text = composer_file.read_text(encoding="utf-8", errors="ignore")
            if "laravel/framework" in text or "illuminate/database" in text or "laravel/laravel" in text:
                logger.info("Framework detected via composer.json: laravel")
                return "laravel"
        except Exception as e:
            logger.warning("Error reading %s: %s", composer_file, e)

    # 2. Prisma: check package.json
    for pkg_file in root.rglob("package.json"):
        if any(part in EXCLUDE_DIRS for part in pkg_file.parts):
            continue
        try:
            text = pkg_file.read_text(encoding="utf-8", errors="ignore")
            if "@prisma/client" in text or '"prisma"' in text:
                logger.info("Framework detected via package.json: prisma")
                return "prisma"
        except Exception as e:
            logger.warning("Error reading %s: %s", pkg_file, e)

    # 3. Django: check python requirements/pyproject
    for req_file in root.rglob("requirements*.txt"):
        if any(part in EXCLUDE_DIRS for part in req_file.parts):
            continue
        try:
            text = req_file.read_text(encoding="utf-8", errors="ignore")
            if "django" in text.lower():
                logger.info("Framework detected via requirements.txt: django")
                return "django"
        except Exception as e:
            logger.warning("Error reading %s: %s", req_file, e)

    # 4. Flutter/Dart: check pubspec.yaml
    for pubspec_file in root.rglob("pubspec.yaml"):
        if any(part in EXCLUDE_DIRS for part in pubspec_file.parts):
            continue
        try:
            text = pubspec_file.read_text(encoding="utf-8", errors="ignore")
            if "flutter:" in text or any(dep in text for dep in ["sqflite:", "drift:", "floor:", "isar:", "realm:"]):
                logger.info("Framework detected via pubspec.yaml: flutter")
                return "flutter"
        except Exception as e:
            logger.warning("Error reading %s: %s", pubspec_file, e)

    # =========================================================================
    # STEP B: Direct Root Signatures
    # =========================================================================
    if (root / "artisan").exists() or (root / "database" / "migrations").is_dir():
        logger.info("Framework detected via root signature: laravel")
        return "laravel"

    if (root / "prisma" / "schema.prisma").exists():
        logger.info("Framework detected via root signature: prisma")
        return "prisma"

    if (root / "manage.py").exists():
        logger.info("Framework detected via root signature: django")
        return "django"

    # =========================================================================
    # STEP C: Flexible Recursive Search
    # =========================================================================
    # 1. Recursive Laravel migration folders
    for mig_dir in root.rglob("database/migrations"):
        if any(part in EXCLUDE_DIRS for part in mig_dir.parts):
            continue
        if mig_dir.is_dir():
            logger.info("Framework detected via recursive migrations folder: laravel")
            return "laravel"

    # 2. Recursive Prisma schema files
    for prisma_file in root.rglob("schema.prisma"):
        if any(part in EXCLUDE_DIRS for part in prisma_file.parts):
            continue
        logger.info("Framework detected via recursive schema.prisma: prisma")
        return "prisma"

    # 3. Recursive Django models/migrations
    for model_file in root.rglob("models.py"):
        if any(part in EXCLUDE_DIRS for part in model_file.parts):
            continue
        logger.info("Framework detected via recursive models.py: django")
        return "django"

    return None
