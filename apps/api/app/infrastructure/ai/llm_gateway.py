from typing import Any
import litellm
from app.infrastructure.security.credential_manager import CredentialManager

class LiteLLMGateway:
    """Gateway for making calls to LLMs using LiteLLM."""

    def __init__(self) -> None:
        pass
        
    def _get_provider(self, model: str) -> str:
        model_lower = model.lower()
        if "gemini" in model_lower:
            return "gemini"
        elif "claude" in model_lower or "anthropic" in model_lower:
            return "anthropic"
        elif "gpt" in model_lower or "openai" in model_lower:
            return "openai"
        elif "openrouter" in model_lower:
            return "openrouter"
        return "gemini" # Default fallback

    def generate_completion(self, prompt: str, model: str, **kwargs) -> str:
        """
        Sends a prompt to the specified model.
        Retrieves the API key securely from the credential manager based on provider.
        Accepts additional kwargs like response_format.
        """
        provider = self._get_provider(model)
        api_key = CredentialManager.get_api_key(provider)
        
        # If no specific key is found for openrouter, it might be in the environment, or we just pass None and let litellm handle it if using ollama local
        if not api_key and provider != "openrouter" and "ollama" not in model.lower():
            raise ValueError(f"AI API Key for {provider} not found in the secure keyring.")

        messages = [{"role": "user", "content": prompt}]

        response = litellm.completion(
            model=model,
            messages=messages,
            api_key=api_key,
            **kwargs
        )

        return str(response.choices[0].message.content)
