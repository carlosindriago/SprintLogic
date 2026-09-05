import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def parse_env_file(file_path: Path) -> dict[str, str]:
    """
    Simple parser for .env key-value pairs.
    """
    env_vars: dict[str, str] = {}
    if not file_path.exists() or not file_path.is_file():
        return env_vars

    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            # Remove wrapping quotes if any
            if (val.startswith('"') and val.endswith('"')) or (
                val.startswith("'") and val.endswith("'")
            ):
                val = val[1:-1]
            env_vars[key] = val
    except Exception as e:
        logger.warning("Error reading .env file %s: %s", file_path, e)

    return env_vars


def sanitize_db_driver(driver: str, port: str = "") -> str:
    """
    Sanitizes database driver strings for SQLAlchemy compatibility.
    Maps custom/multitenant connections (e.g. 'landlord', 'tenant', 'pgsql')
    to valid SQLAlchemy dialects ('postgresql', 'mysql', 'sqlite', 'mssql').
    """
    drv = driver.lower().strip()

    # Exact standard aliases
    if drv in ("pgsql", "postgres"):
        return "postgresql"
    if drv in ("sqlite", "sqlite3"):
        return "sqlite"
    if drv in ("mysql", "mariadb"):
        return "mysql"
    if drv in ("mssql", "sqlserver"):
        return "mssql"

    # Known standard dialect strings
    if any(standard in drv for standard in ("postgresql", "mysql", "sqlite", "mssql", "mariadb")):
        return drv

    # Fallback heuristic based on DB_PORT if driver is custom (e.g. 'landlord', 'tenant')
    clean_port = port.strip()
    if clean_port == "5432":
        logger.info("Custom driver '%s' mapped to 'postgresql' based on port 5432", driver)
        return "postgresql"
    elif clean_port in ("3306", "3307"):
        logger.info("Custom driver '%s' mapped to 'mysql' based on port %s", driver, clean_port)
        return "mysql"
    elif clean_port == "1433":
        logger.info("Custom driver '%s' mapped to 'mssql' based on port 1433", driver)
        return "mssql"

    # Default fallback to postgresql if unrecognized
    logger.info("Custom driver '%s' defaulted to 'postgresql'", driver)
    return "postgresql"


def discover_db_url_from_project(project_path: str) -> str | None:
    """
    Scans project_path for .env files and constructs a SQLAlchemy database URL if credentials exist.
    """
    root = Path(project_path)
    if not root.exists() or not root.is_dir():
        return None

    # Priority of env files
    env_files = [root / ".env", root / ".env.local", root / ".env.development"]
    combined_env: dict[str, str] = {}

    for env_file in env_files:
        if env_file.exists():
            combined_env.update(parse_env_file(env_file))

    if not combined_env:
        return None

    # 1. Direct DATABASE_URL
    if "DATABASE_URL" in combined_env and combined_env["DATABASE_URL"]:
        raw_url = combined_env["DATABASE_URL"]
        # Convert postgres:// or pgsql:// for SQLAlchemy compatibility
        if raw_url.startswith("postgres://"):
            raw_url = raw_url.replace("postgres://", "postgresql://", 1)
        elif raw_url.startswith("pgsql://"):
            raw_url = raw_url.replace("pgsql://", "postgresql://", 1)
        return raw_url

    # 2. Individual DB_* variables (Laravel / Express / Spring)
    raw_driver = combined_env.get("DB_CONNECTION") or combined_env.get("DB_DRIVER") or "postgresql"
    host = combined_env.get("DB_HOST", "127.0.0.1")
    port = combined_env.get("DB_PORT", "")
    database = combined_env.get("DB_DATABASE") or combined_env.get("DB_NAME") or ""
    username = combined_env.get("DB_USERNAME") or combined_env.get("DB_USER") or ""
    password = combined_env.get("DB_PASSWORD") or combined_env.get("DB_PASS") or ""

    if not database:
        return None

    driver = sanitize_db_driver(raw_driver, port)

    if driver == "sqlite":
        # Allow legitimate absolute paths, but prevent traversal for relative paths
        if Path(database).is_absolute():
            sqlite_path = Path(database)
        else:
            sqlite_path = (root / database).resolve()
            if not sqlite_path.is_relative_to(root.resolve()):
                logger.warning("Path traversal attempt detected in sqlite db path: %s", database)
                return None
        return f"sqlite:///{sqlite_path}"

    auth_part = ""
    if username:
        auth_part = f"{username}:{password}@" if password else f"{username}@"

    port_part = f":{port}" if port else ""

    if driver == "mysql":
        return f"mysql+pymysql://{auth_part}{host}{port_part}/{database}"
    elif driver == "postgresql":
        return f"postgresql://{auth_part}{host}{port_part}/{database}"
    elif driver == "mssql":
        return f"mssql+pyodbc://{auth_part}{host}{port_part}/{database}"

    return f"{driver}://{auth_part}{host}{port_part}/{database}"
