from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def build_agent_context(
    session: AsyncSession,
    project_id: str,
    user_query: str,
    agent_type: str = "",
) -> str:
    """Retrieve relevant episodic memories from project_memories via FTS5.

    Extracts keywords from user_query, searches FTS5 for related memories,
    and formats them into a contextual block for the LLM prompt.
    """
    if not project_id:
        return ""

    keywords = _extract_keywords(user_query)
    if not keywords:
        return ""

    query_str = " OR ".join(keywords) + "*"

    try:
        result = await session.execute(
            text(
                "SELECT agent_name, context_type, memory_content FROM project_memories "
                "WHERE project_memories MATCH :q AND project_id = :pid "
                "ORDER BY rank LIMIT 5"
            ),
            {"q": query_str, "pid": project_id},
        )
        rows = result.fetchall()
        if not rows:
            return ""

        lines = ["\n--- MEMORIA DEL PROYECTO ---"]
        for i, (agent, ctx_type, content) in enumerate(rows, 1):
            label = _context_label(ctx_type)
            lines.append(f"{i}. [{label}] {content[:300]}")
        return "\n".join(lines)
    except Exception:
        return ""


def _extract_keywords(query: str) -> list[str]:
    """Extract meaningful keywords from a user query."""
    skip = {
        "el",
        "la",
        "los",
        "las",
        "un",
        "una",
        "de",
        "del",
        "en",
        "que",
        "es",
        "no",
        "si",
        "por",
        "para",
        "con",
        "como",
        "me",
        "se",
        "lo",
        "the",
        "a",
        "an",
        "is",
        "in",
        "of",
        "to",
        "it",
        "and",
        "or",
        "hazme",
        "puedes",
        "podrías",
        "explicar",
        "cómo",
        "qué",
        "este",
        "this",
        "that",
        "explain",
        "what",
        "how",
        "can",
        "you",
    }
    words = query.lower().split()
    return [w for w in words if len(w) > 3 and w not in skip][:5]


def _context_label(ctx_type: str) -> str:
    labels = {
        "architectural_decision": "Decisión de Arquitectura",
        "bug_fix": "Bug Corregido",
        "chat_summary": "Resumen de Chat",
    }
    return labels.get(ctx_type, ctx_type.replace("_", " ").title())
