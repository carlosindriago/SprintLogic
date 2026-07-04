import litellm

from app.infrastructure.security.credential_manager import CredentialManager


class LiteLLMGateway:
    """Gateway for making calls to LLMs using LiteLLM."""

    def __init__(self) -> None:
        pass

    def _get_provider_and_model(self, model_str: str) -> tuple[str, str]:
        parts = model_str.split("/", 1)
        if len(parts) == 2:
            return parts[0], parts[1]

        model_lower = model_str.lower()
        if "gemini" in model_lower:
            return "gemini", model_str
        elif "claude" in model_lower or "anthropic" in model_lower:
            return "anthropic", model_str
        elif "gpt" in model_lower or "openai" in model_lower:
            return "openai", model_str
        elif "openrouter" in model_lower:
            return "openrouter", model_str
        return "gemini", model_str

    def generate_completion(self, prompt: str, model: str, **kwargs) -> str:
        """
        Sends a prompt to the specified model.
        Retrieves the API key securely from the credential manager based on provider.
        Accepts additional kwargs like response_format.
        """
        provider, model_id = self._get_provider_and_model(model)
        api_key = CredentialManager.get_api_key(provider)

        # If no specific key is found for openrouter, it might be in the environment, or we just pass None and let litellm handle it if using ollama local
        if not api_key and provider != "openrouter" and "ollama" not in model.lower():
            raise ValueError(f"AI API Key for {provider} not found in the secure keyring.")

        messages = [{"role": "user", "content": prompt}]

        # Handle custom OpenAI-compatible providers
        if provider == "opencode-zen":
            kwargs["api_base"] = "https://opencode.ai/zen/v1"
            litellm_model = f"openai/{model_id}"
        elif provider == "opencode-go":
            kwargs["api_base"] = "https://opencode.ai/zen/go/v1"
            litellm_model = f"openai/{model_id}"
        else:
            litellm_model = model if "/" in model else model_id

        response = litellm.completion(
            model=litellm_model,
            messages=messages,
            api_key=api_key,
            **kwargs
        )

        return str(response.choices[0].message.content)
