from datetime import datetime
from uuid import UUID

import pytest

from app.domain.organization import Organization


def test_create_valid_organization() -> None:
    organization = Organization(name="Pixel Studio")

    assert isinstance(organization.id, UUID)
    assert organization.name == "Pixel Studio"
    assert isinstance(organization.created_at, datetime)


@pytest.mark.parametrize("invalid_name", ["", "   "])
def test_create_organization_with_empty_name_raises_error(invalid_name: str) -> None:
    with pytest.raises(ValueError, match="Organization name cannot be empty"):
        Organization(name=invalid_name)
