import os

# The global default LLM model used as a fallback safety net for background workers
# and endpoints when the frontend fails to supply an explicit model.
# This prevents the backend from crashing when no HTTP request is present.
DEFAULT_LLM_MODEL: str = os.getenv("DEFAULT_LLM_MODEL", "gemini/gemini-2.5-flash")

# Dedicated model for the Insight Worker (background memory consolidation).
# Falls back to DEFAULT_LLM_MODEL when not specified. Override via environment
# variable if you need a different provider (e.g., OpenAI for rate-limit relief):
#   INSIGHT_WORKER_MODEL=openai/gpt-4o-mini
INSIGHT_WORKER_MODEL: str = os.getenv("INSIGHT_WORKER_MODEL", DEFAULT_LLM_MODEL)
