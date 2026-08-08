import logging

logger = logging.getLogger(__name__)

import asyncio
import os
import time

# Cache to avoid hammering the disk
# Key: project_path, Value: (timestamp, xml_result)
_SCAN_CACHE: dict[str, tuple[float, str]] = {}
_CACHE_TTL_SECONDS = 60


from .scanner._build_report import build_awareness_xml
from .scanner._detect_patterns import determine_project_type
from .scanner._parse_files import parse_project_files


def _scan_blocking(project_path: str) -> str:
    """
    Synchronous blocking function to scan the project.
    Must be run in a separate thread.
    """
    if not os.path.isdir(project_path):
        return "<PROJECT_AWARENESS>\n  <error>Project path not found</error>\n</PROJECT_AWARENESS>"

    total_files, core_tech = parse_project_files(project_path)
    project_type = determine_project_type(core_tech)

    # Placeholder for _analyze_metrics if needed in future
    # from .scanner._analyze_metrics import analyze_project_metrics
    # metrics = analyze_project_metrics({})

    return build_awareness_xml(project_path, project_type, core_tech, total_files)


async def get_project_awareness_xml(project_path: str | None) -> str:
    """
    Returns an XML block summarizing the project structure and tech stack.
    Delegates the heavy I/O to a background thread to prevent blocking the Event Loop.
    Includes caching to avoid hammering the disk.
    """
    if not project_path:
        return ""

    now = time.time()

    # Check cache
    if project_path in _SCAN_CACHE:
        timestamp, result = _SCAN_CACHE[project_path]
        if now - timestamp < _CACHE_TTL_SECONDS:
            return result

    # Delegate blocking I/O to thread pool
    result = await asyncio.to_thread(_scan_blocking, project_path)

    # Update cache
    _SCAN_CACHE[project_path] = (now, result)

    return result
