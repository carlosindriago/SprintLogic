import litellm

from app.infrastructure.ai.provider_adapter import ProviderAdapter
from app.infrastructure.security.credential_manager import CredentialManager


class LiteLLMGateway:
    """Gateway for making calls to LLMs using LiteLLM."""

    def __init__(self) -> None:
        pass

    def _resolve_key(self, model: str) -> tuple[str, str | None]:
        """Return provider and API key for the requested model."""
        provider = ProviderAdapter.get_provider(model)
        api_key = CredentialManager.get_api_key(provider)
        return provider, api_key

    def generate_completion(self, prompt: str, model: str, **kwargs) -> str:
        """
        Sends a prompt to the specified model.
        Retrieves the API key securely from the credential manager based on provider.
        Accepts additional kwargs like response_format.
        """
        provider, api_key = self._resolve_key(model)

        # If no specific key is found for openrouter, it might be in the environment, or we just pass None and let litellm handle it if using ollama local
        if not api_key and provider != "openrouter" and "ollama" not in model.lower():
            raise ValueError(f"AI API Key for {provider} not found in the secure keyring.")

        messages = [{"role": "user", "content": prompt}]

        adapted = ProviderAdapter.adapt(model, api_key)
        response = litellm.completion(
            model=adapted["model"],
            messages=messages,
            api_key=adapted["api_key"],
            **adapted["kwargs"],
            **kwargs,
        )

        return str(response.choices[0].message.content)
