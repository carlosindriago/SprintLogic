from unittest.mock import MagicMock, patch

import pytest

from app.infrastructure.ai.llm_gateway import LiteLLMGateway


@patch("app.infrastructure.ai.llm_gateway.CredentialManager.get_api_key")
@patch("app.infrastructure.ai.llm_gateway.litellm.completion")
def test_generate_completion_success(mock_completion, mock_get_api_key):
    mock_get_api_key.return_value = "fake-api-key"

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "Mocked LLM response"
    mock_completion.return_value = mock_response

    gateway = LiteLLMGateway()
    result = gateway.generate_completion("Hello AI", "gpt-4o")

    assert result == "Mocked LLM response"
    mock_get_api_key.assert_called_once()
    mock_completion.assert_called_once_with(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello AI"}],
        api_key="fake-api-key"
    )

@patch("app.infrastructure.ai.llm_gateway.CredentialManager.get_api_key")
def test_generate_completion_missing_key(mock_get_api_key):
    mock_get_api_key.return_value = None

    gateway = LiteLLMGateway()
    with pytest.raises(ValueError, match="AI API Key for openai not found in the secure keyring."):
        gateway.generate_completion(prompt="Hello", model="openai/gpt-4")
