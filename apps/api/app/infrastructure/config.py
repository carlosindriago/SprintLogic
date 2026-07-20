import os

# The global default LLM model used as a fallback safety net for background workers
# and endpoints when the frontend fails to supply an explicit model.
# This prevents the backend from crashing when no HTTP request is present.
DEFAULT_LLM_MODEL: str = os.getenv("DEFAULT_LLM_MODEL", "gemini/gemini-2.5-flash")
