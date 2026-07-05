from unittest.mock import patch

import keyring

from app.infrastructure.security.credential_manager import CredentialManager


@patch("app.infrastructure.security.credential_manager.keyring.set_password")
def test_save_api_key(mock_set_password):
    CredentialManager.save_api_key("gemini", "test_key")
    mock_set_password.assert_called_once_with("sprintlogic_gemini", "api_key", "test_key")


@patch("app.infrastructure.security.credential_manager.keyring.get_password")
def test_get_api_key(mock_get_password):
    mock_get_password.return_value = "test_key"
    assert CredentialManager.get_api_key("gemini") == "test_key"
    mock_get_password.assert_called_once_with("sprintlogic_gemini", "api_key")


@patch("app.infrastructure.security.credential_manager.keyring.delete_password")
def test_delete_api_key_success(mock_delete_password):
    CredentialManager.delete_api_key("gemini")
    mock_delete_password.assert_called_once_with("sprintlogic_gemini", "api_key")


@patch("app.infrastructure.security.credential_manager.keyring.delete_password")
def test_delete_api_key_not_found(mock_delete_password):
    mock_delete_password.side_effect = keyring.errors.PasswordDeleteError()
    # Should not raise
    CredentialManager.delete_api_key("gemini")
    mock_delete_password.assert_called_once_with("sprintlogic_gemini", "api_key")
