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
    CUSTOM_PROVIDERS: dict[str, dict[str, Any]] = {
        "opencode-zen": {
            "litellm_provider": "openai",
            "api_base": "https://opencode.ai/zen/v1",
        },
        "opencode-go": {
            "litellm_provider": "openai",
            "api_base": "https://opencode.ai/zen/go/v1",
        },
        "zai": {
            "litellm_provider": "openai",
            "api_base": "https://api.z.ai/api/paas/v4",
            "extra_headers": {"Accept-Language": "en-US,en"},
        },
        "z-ai": {
            "litellm_provider": "openai",
            "api_base": "https://api.z.ai/api/paas/v4",
            "extra_headers": {"Accept-Language": "en-US,en"},
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
            if provider == "nvidia_nim":
                return "nvidia"
            if provider in ("z-ai", "zai"):
                return "zai"
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
        if "z-ai" in model_lower or "zai" in model_lower or "glm" in model_lower:
            return "zai"
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

        # Fix double prefixing issue (e.g. nvidia/nvidia_nim/...)
        sub_provider, sub_model_id = cls._split_model(model_id)
        if sub_provider and sub_provider == provider:
            model_id = sub_model_id
        elif sub_provider and provider == "nvidia" and sub_provider == "nvidia_nim":
            # If outer is nvidia and inner is nvidia_nim, use inner completely
            provider = "nvidia_nim"
            model_id = sub_model_id

        internal_provider = "nvidia" if provider == "nvidia_nim" else provider
        config = cls.CUSTOM_PROVIDERS.get(internal_provider, {})

        kwargs: dict[str, Any] = {}

        if config.get("litellm_provider"):
            litellm_model = f"{config['litellm_provider']}/{model_id}"
        else:
            litellm_model = f"{provider}/{model_id}" if provider else model_id

        if config.get("api_base"):
            kwargs["api_base"] = config["api_base"]

        if config.get("extra_headers"):
            kwargs["extra_headers"] = config["extra_headers"]

        # NVIDIA NIM expects its key via an environment variable.
        if internal_provider == "nvidia" and api_key:
            os.environ["NVIDIA_NIM_API_KEY"] = api_key

        return {
            "model": litellm_model,
            "api_key": api_key,
            "kwargs": kwargs,
        }
