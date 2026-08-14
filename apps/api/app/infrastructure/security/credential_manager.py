import os

import keyring
import keyring.errors

ENV_VAR_MAPPINGS: dict[str, list[str]] = {
    "gemini": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    "openai": ["OPENAI_API_KEY"],
    "anthropic": ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    "openrouter": ["OPENROUTER_API_KEY"],
    "groq": ["GROQ_API_KEY"],
    "nvidia": ["NVIDIA_API_KEY", "NVIDIA_NIM_API_KEY"],
    "zai": ["ZAI_API_KEY", "Z_AI_API_KEY", "ZHIPU_API_KEY"],
    "cerebras": ["CEREBRAS_API_KEY"],
    "opencode-zen": ["OPENCODE_ZEN_API_KEY", "OPENCODE_API_KEY"],
    "opencode-go": ["OPENCODE_GO_API_KEY"],
}


class CredentialManager:
    """Manages AI API credentials securely using the OS keyring with environment variable fallback."""

    @staticmethod
    def _get_namespace(provider: str) -> str:
        return f"sprintlogic_{provider.lower()}"

    @classmethod
    def save_api_key(cls, provider: str, api_key: str) -> None:
        """Saves the API key securely for a specific provider."""
        keyring.set_password(cls._get_namespace(provider), "api_key", api_key)

    @classmethod
    def get_api_key(cls, provider: str) -> str | None:
        """Retrieves the API key for a specific provider from keyring or environment variables."""
        key = keyring.get_password(cls._get_namespace(provider), "api_key")
        if key and key.strip():
            return key.strip()

        # Fallback to environment variables
        env_vars = ENV_VAR_MAPPINGS.get(provider.lower(), [f"{provider.upper()}_API_KEY"])
        for var_name in env_vars:
            val = os.environ.get(var_name)
            if val and val.strip():
                return val.strip()

        return None

    @classmethod
    def delete_api_key(cls, provider: str) -> None:
        """Deletes the API key for a specific provider."""
        try:
            keyring.delete_password(cls._get_namespace(provider), "api_key")
        except keyring.errors.PasswordDeleteError:
            pass
