import hashlib
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def calculate_schema_hash(project_path: str) -> str:
    """
    Calculates a combined SHA-256 hash of all database schema and migration files.
    This hash acts as a fingerprint to determine if the DB structure has changed.
    """
    base_dir = Path(project_path)

    # Define exact paths or glob patterns to include
    patterns = [
        "database/migrations/**/*.php",  # Laravel Migrations
        "app/Models/**/*.php",           # Laravel Eloquent Models
        "prisma/schema.prisma",          # Prisma ORM
        "**/*/migrations/*.py",          # Django Migrations
        "**/*.sql",                      # Raw SQL files
        "db/schema.rb"                   # Ruby on Rails Schema
    ]

    ignore_dirs = {".git", "node_modules", "vendor", "__pycache__", ".venv", "venv"}

    files_to_hash = []

    for pattern in patterns:
        try:
            for filepath in base_dir.rglob(pattern):
                if not filepath.is_file():
                    continue
                # Skip if any part of the path is in the ignore list
                if any(part in ignore_dirs for part in filepath.parts):
                    continue
                files_to_hash.append(filepath)
        except Exception as e:
            logger.warning(f"Error resolving glob {pattern}: {e}")

    # Sort files to ensure deterministic hashing
    files_to_hash.sort()

    hasher = hashlib.sha256()

    if not files_to_hash:
        return "empty_schema"

    for file in files_to_hash:
        try:
            content = file.read_bytes()
            hasher.update(content)
        except Exception as e:
            logger.warning(f"Could not read {file} for hashing: {e}")

    current_hash = hasher.hexdigest()
    logger.info(f"Calculated schema hash: {current_hash} (from {len(files_to_hash)} files)")

    return current_hash
