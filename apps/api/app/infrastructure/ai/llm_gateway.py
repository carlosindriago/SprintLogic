import litellm

from app.infrastructure.ai.provider_adapter import ProviderAdapter
from app.infrastructure.security.credential_manager import CredentialManager


class LiteLLMGateway:
    """Gateway for making calls to LLMs using LiteLLM."""

    def __init__(self) -> None:
        pass


    def _build_language_clause(self, lang_code: str) -> str:
        if lang_code == "es":
            return "\n\nIMPORTANT: Please write your entire response in Spanish."
        elif lang_code == "pt":
            return "\n\nIMPORTANT: Please write your entire response in Portuguese."
        return ""

    def _resolve_key(self, model: str) -> tuple[str, str | None, str | None]:
        """Return provider, API key, and optional base_url for the requested model."""
        provider = ProviderAdapter.get_provider(model)

        if provider.startswith("custom_"):
            provider_id = provider.replace("custom_", "")
            import keyring

            from app.infrastructure.db.sync_helpers import get_custom_provider_sync

            p_data = get_custom_provider_sync(provider_id)
            if p_data:
                api_key = keyring.get_password(p_data["keyring_service_id"], "api_key")
                return provider, api_key, p_data["base_url"]
            return provider, None, None

        api_key = CredentialManager.get_api_key(provider)
        return provider, api_key, None

    def generate_completion(self, prompt: str, model: str, lang_code: str = "en", fallbacks: list[str] | None = None, **kwargs) -> str:
        """
        Sends a prompt to the specified model.
        Retrieves the API key securely from the credential manager based on provider.
        Accepts additional kwargs like response_format.
        """
        prompt += self._build_language_clause(lang_code)
        messages = [{"role": "user", "content": prompt}]
        
        models_to_try = [model]
        if fallbacks:
            models_to_try.extend(fallbacks)
            
        # Do not pass fallbacks to litellm directly, we handle it
        if "fallbacks" in kwargs:
            del kwargs["fallbacks"]
            
        last_error = None
        for current_model in models_to_try:
            try:
                provider, api_key, base_url = self._resolve_key(current_model)
        
                # If no specific key is found for openrouter, it might be in the environment, or we just pass None and let litellm handle it if using ollama local
                if not api_key and provider != "openrouter" and "ollama" not in current_model.lower():
                    raise ValueError(f"AI API Key for {provider} not found in the secure keyring.")
        
                adapted = ProviderAdapter.adapt(current_model, api_key)
        
                call_kwargs = adapted["kwargs"].copy()
                call_kwargs.update(kwargs)
                if base_url:
                    call_kwargs["api_base"] = base_url
        
                response = litellm.completion(
                    model=adapted["model"],
                    messages=messages,
                    api_key=adapted["api_key"],
                    **call_kwargs,
                )
        
                return str(response.choices[0].message.content)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"LiteLLM call failed for model {current_model}: {e}")
                last_error = e
                continue
                
        raise last_error or RuntimeError("All LLM models failed.")

    async def async_generate_completion(self, prompt: str, model: str, lang_code: str = "en", fallbacks: list[str] | None = None, **kwargs) -> str:
        """
        Asynchronously sends a prompt to the specified model.
        Retrieves the API key securely from the credential manager based on provider.
        Accepts additional kwargs like response_format.
        """
        prompt += self._build_language_clause(lang_code)
        messages = [{"role": "user", "content": prompt}]

        models_to_try = [model]
        if fallbacks:
            models_to_try.extend(fallbacks)
            
        # Do not pass fallbacks to litellm directly, we handle it
        if "fallbacks" in kwargs:
            del kwargs["fallbacks"]
            
        last_error = None
        for current_model in models_to_try:
            try:
                provider, api_key, base_url = self._resolve_key(current_model)
        
                if not api_key and provider != "openrouter" and "ollama" not in current_model.lower():
                    raise ValueError(f"AI API Key for {provider} not found in the secure keyring.")
        
                adapted = ProviderAdapter.adapt(current_model, api_key)
        
                call_kwargs = adapted["kwargs"].copy()
                call_kwargs.update(kwargs)
                if base_url:
                    call_kwargs["api_base"] = base_url
        
                response = await litellm.acompletion(
                    model=adapted["model"],
                    messages=messages,
                    api_key=adapted["api_key"],
                    **call_kwargs,
                )
        
                return str(response.choices[0].message.content)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"LiteLLM async call failed for model {current_model}: {e}")
                last_error = e
                continue
                
        raise last_error or RuntimeError("All LLM models failed.")
