import keyring
import keyring.errors

class CredentialManager:
    """Manages AI API credentials securely using the OS keyring."""
    
    NAMESPACE = "sprintlogic"
    
    @staticmethod
    def _get_key_name(provider: str) -> str:
        return f"{provider}_api_key".lower()

    @classmethod
    def save_api_key(cls, provider: str, api_key: str) -> None:
        """Saves the API key securely for a specific provider."""
        keyring.set_password(cls.NAMESPACE, cls._get_key_name(provider), api_key)

    @classmethod
    def get_api_key(cls, provider: str) -> str | None:
        """Retrieves the API key for a specific provider."""
        return keyring.get_password(cls.NAMESPACE, cls._get_key_name(provider))

    @classmethod
    def delete_api_key(cls, provider: str) -> None:
        """Deletes the API key for a specific provider."""
        try:
            keyring.delete_password(cls.NAMESPACE, cls._get_key_name(provider))
        except keyring.errors.PasswordDeleteError:
            pass
