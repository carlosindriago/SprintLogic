import keyring
import keyring.errors


class CredentialManager:
    """Manages AI API credentials securely using the OS keyring."""

    @staticmethod
    def _get_namespace(provider: str) -> str:
        return f"sprintlogic_{provider.lower()}"

    @classmethod
    def save_api_key(cls, provider: str, api_key: str) -> None:
        """Saves the API key securely for a specific provider."""
        keyring.set_password(cls._get_namespace(provider), "api_key", api_key)

    @classmethod
    def get_api_key(cls, provider: str) -> str | None:
        """Retrieves the API key for a specific provider."""
        return keyring.get_password(cls._get_namespace(provider), "api_key")

    @classmethod
    def delete_api_key(cls, provider: str) -> None:
        """Deletes the API key for a specific provider."""
        try:
            keyring.delete_password(cls._get_namespace(provider), "api_key")
        except keyring.errors.PasswordDeleteError:
            pass
