"""Provider adapter for LiteLLM routing.

Maps custom provider prefixes to LiteLLM-compatible model strings and
injects the explicit api_base/api_key arguments required by OpenAI-compatible
endpoints that LiteLLM does not recognize natively.
"""

from __future__ import annotations

import os
from typing import Any


class ProviderAdapter:
    """Adapts a model identifier and API key for LiteLLM invocation."""

    # Registry of custom providers that require explicit routing.
    CUSTOM_PROVIDERS: dict[str, dict[str, str]] = {
        "opencode-zen": {
            "litellm_provider": "openai",
            "api_base": "https://opencode.ai/zen/v1",
        },
        "opencode-go": {
            "litellm_provider": "openai",
            "api_base": "https://opencode.ai/zen/go/v1",
        },
    }

    @staticmethod
    def _split_model(model: str) -> tuple[str, str]:
        """Split 'provider/model_id' into (provider, model_id)."""
        parts = model.split("/", 1)
        if len(parts) == 2:
            return parts[0], parts[1]
        return "", model

    @classmethod
    def get_provider(cls, model: str) -> str:
        """Infer the provider key used for credential lookup."""
        provider, _ = cls._split_model(model)
        if provider:
            return provider

        model_lower = model.lower()
        if "gemini" in model_lower:
            return "gemini"
        if "claude" in model_lower or "anthropic" in model_lower:
            return "anthropic"
        if "gpt" in model_lower or "openai" in model_lower:
            return "openai"
        if "openrouter" in model_lower:
            return "openrouter"
        if "nvidia" in model_lower or "_nim" in model_lower:
            return "nvidia"
        return "gemini"

    @classmethod
    def adapt(cls, model: str, api_key: str | None = None) -> dict[str, Any]:
        """Return LiteLLM-ready parameters for the given model.

        The returned dict contains at least:
            - model: the LiteLLM-compatible model string
            - api_key: the API key to use (may be None)
            - kwargs: extra kwargs to pass to completion/acompletion
        """
        provider, model_id = cls._split_model(model)
        if not model_id or model_id.lower() == "default":
            raise ValueError(f"Invalid or missing model name: {model}")

        config = cls.CUSTOM_PROVIDERS.get(provider, {})

        kwargs: dict[str, Any] = {}

        if config.get("litellm_provider"):
            litellm_model = f"{config['litellm_provider']}/{model_id}"
        else:
            litellm_model = model if provider else model_id

        if config.get("api_base"):
            kwargs["api_base"] = config["api_base"]

        # NVIDIA NIM expects its key via an environment variable.
        if provider == "nvidia" and api_key:
            os.environ["NVIDIA_NIM_API_KEY"] = api_key

        return {
            "model": litellm_model,
            "api_key": api_key,
            "kwargs": kwargs,
        }
