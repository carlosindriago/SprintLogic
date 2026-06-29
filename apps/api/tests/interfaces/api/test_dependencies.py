import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from app.interfaces.api.dependencies import get_current_user
from app.domain.user import User
from app.interfaces.auth_gateway import AuthGateway
from uuid import uuid4

class MockAuthGateway(AuthGateway):
    def __init__(self):
        self.user = User(id=uuid4(), email="mock@test.com", name="Mock User")
        self.should_fail = False

    def get_user_from_token(self, token: str):
        if self.should_fail:
            return None
        return self.user

    def get_current_user(self):
        return None

def test_get_current_user_valid():
    gateway = MockAuthGateway()
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid.token")
    user = get_current_user(credentials=creds, auth_gateway=gateway)
    assert user.email == "mock@test.com"

def test_get_current_user_invalid():
    gateway = MockAuthGateway()
    gateway.should_fail = True
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid.token")
    with pytest.raises(HTTPException) as exc:
        get_current_user(credentials=creds, auth_gateway=gateway)
    assert exc.value.status_code == 401
