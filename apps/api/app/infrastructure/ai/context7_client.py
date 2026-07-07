"""Context7 MCP client with async LRU caching for tech documentation."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx

_logger = logging.getLogger("sprintlogic.context7")

CACHE_MAX = 64
CACHE_TTL = 300  # 5 minutes


class ContextCacheEntry:
    __slots__ = ("data", "ts")
    data: str
    ts: float

    def __init__(self, data: str) -> None:
        self.data = data
        self.ts = time.monotonic()


class Context7Client:
    """Async client for Context7 documentation search with in-memory LRU cache."""

    _cache: dict[str, ContextCacheEntry] = {}
    _http: httpx.AsyncClient | None = None

    @classmethod
    async def _get_client(cls) -> httpx.AsyncClient:
        if cls._http is None:
            cls._http = httpx.AsyncClient(
                timeout=httpx.Timeout(10.0),
                headers={"User-Agent": "SprintLogic/1.0"},
            )
        return cls._http

    @classmethod
    def _cache_key(cls, query: str) -> str:
        return query.lower().strip()

    @classmethod
    async def search(cls, query: str, api_key: str) -> str:
        """Query Context7 and return concatenated snippets."""
        key = cls._cache_key(query)
        entry = cls._cache.get(key)
        if entry and (time.monotonic() - entry.ts) < CACHE_TTL:
            return entry.data

        try:
            client = await cls._get_client()
            resp = await client.post(
                "https://api.context7.ai/v1/query-docs",
                json={"query": query, "libraryId": "/"},
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            body = resp.json()
            snippets = cls._extract_snippets(body)
            data = "\n---\n".join(snippets[:6]) if snippets else ""

            if len(cls._cache) >= CACHE_MAX:
                cls._cache.pop(next(iter(cls._cache)))
            cls._cache[key] = ContextCacheEntry(data)
            return data
        except Exception:
            _logger.debug("Context7 query failed for %s", query, exc_info=True)
            return ""

    @staticmethod
    def _extract_snippets(body: Any) -> list[str]:
        snippets: list[str] = []
        if isinstance(body, dict):
            candidates = body.get("snippets") or body.get("results") or []
            if isinstance(candidates, list):
                for s in candidates[:6]:
                    if isinstance(s, dict):
                        snippets.append(s.get("text") or s.get("content") or "")
                    elif isinstance(s, str):
                        snippets.append(s)
        return [s for s in snippets if s]

    @classmethod
    async def preload(cls, file_extension: str, imports: list[str], api_key: str) -> None:
        """Preload context for multiple tech stack entries."""
        if not api_key:
            return

        terms: set[str] = {" ".join(imports[:3])} if imports else set()
        lang = _extension_to_language(file_extension)
        if lang:
            terms.add(lang)

        tasks = [cls.search(term, api_key) for term in terms]
        await asyncio.gather(*tasks, return_exceptions=True)


_EXT_MAP: dict[str, str] = {
    ".ts": "TypeScript",
    ".tsx": "React TypeScript",
    ".js": "JavaScript",
    ".jsx": "React",
    ".py": "Python",
    ".rs": "Rust",
    ".go": "Go",
    ".css": "CSS",
    ".html": "HTML",
    ".json": "JSON",
    ".md": "Markdown",
}


def _extension_to_language(ext: str) -> str:
    return _EXT_MAP.get(ext.lower(), "")
