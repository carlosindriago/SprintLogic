from datetime import datetime
from uuid import UUID

import pytest

from app.domain.user import User


def test_create_valid_user() -> None:
    user = User(email="test@example.com", name="John Doe")

    assert isinstance(user.id, UUID)
    assert user.email == "test@example.com"
    assert user.name == "John Doe"
    assert isinstance(user.created_at, datetime)


@pytest.mark.parametrize("invalid_email", ["", "   ", "not-an-email"])
def test_create_user_with_invalid_email_raises_error(invalid_email: str) -> None:
    with pytest.raises(ValueError, match="Invalid email format"):
        User(email=invalid_email, name="John Doe")


@pytest.mark.parametrize("invalid_name", ["", "   "])
def test_create_user_with_empty_name_raises_error(invalid_name: str) -> None:
    with pytest.raises(ValueError, match="User name cannot be empty"):
        User(email="test@example.com", name=invalid_name)
