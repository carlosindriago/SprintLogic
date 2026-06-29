from typing import Any
import litellm
from app.infrastructure.security.credential_manager import CredentialManager

class LiteLLMGateway:
    """Gateway for making calls to LLMs using LiteLLM."""

    def __init__(self) -> None:
        pass

    def generate_completion(self, prompt: str, model: str) -> str:
        """
        Sends a prompt to the specified model.
        Retrieves the API key securely from the credential manager.
        """
        api_key = CredentialManager.get_api_key()
        if not api_key:
            raise ValueError("AI API Key not found in the secure keyring.")
            
        messages = [{"role": "user", "content": prompt}]
        
        response = litellm.completion(
            model=model,
            messages=messages,
            api_key=api_key,
        )
        
        return str(response.choices[0].message.content)
