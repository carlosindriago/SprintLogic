import os

# The global default LLM model used as a fallback safety net for background workers
# and endpoints when the frontend fails to supply an explicit model.
# This prevents the backend from crashing when no HTTP request is present.
DEFAULT_LLM_MODEL: str = os.getenv("DEFAULT_LLM_MODEL", "gemini/gemini-2.5-flash")

# Global default embedding model
DEFAULT_EMBEDDING_MODEL: str = os.getenv("DEFAULT_EMBEDDING_MODEL", "gemini/embedding-001")

# Files larger than this are skipped before parsing/reading them for context
# (RAG, embeddings, tree-sitter, file browsing) — mitigates memory/latency
# blowups on generated or minified blobs. Was previously copy-pasted as a
# module-level constant in 9 different files; 7 of those never actually
# referenced it (dead code left over from an earlier refactor).
MAX_FILE_BYTES: int = 500_000

