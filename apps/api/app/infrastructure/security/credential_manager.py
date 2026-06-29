import keyring
import keyring.errors

class CredentialManager:
    """Manages AI API credentials securely using the OS keyring."""
    
    NAMESPACE = "sprintlogic"
    KEY_NAME = "ai_api_key"

    @classmethod
    def save_api_key(cls, api_key: str) -> None:
        """Saves the API key securely."""
        keyring.set_password(cls.NAMESPACE, cls.KEY_NAME, api_key)

    @classmethod
    def get_api_key(cls) -> str | None:
        """Retrieves the API key."""
        return keyring.get_password(cls.NAMESPACE, cls.KEY_NAME)

    @classmethod
    def delete_api_key(cls) -> None:
        """Deletes the API key."""
        try:
            keyring.delete_password(cls.NAMESPACE, cls.KEY_NAME)
        except keyring.errors.PasswordDeleteError:
            pass
