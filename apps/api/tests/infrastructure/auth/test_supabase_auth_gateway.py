import os
import jwt
from uuid import uuid4
from datetime import datetime, UTC, timedelta
from app.infrastructure.auth.supabase_auth_gateway import SupabaseAuthGateway
import pytest

def test_get_user_from_token_valid():
    secret = "super-secret-jwt-token-with-at-least-32-characters-long"
    os.environ["SUPABASE_JWT_SECRET"] = secret
    gateway = SupabaseAuthGateway()
    
    user_id = str(uuid4())
    payload = {
        "sub": user_id,
        "email": "test@example.com",
        "user_metadata": {
            "name": "Test User"
        },
        "exp": datetime.now(UTC) + timedelta(hours=1),
        "iat": datetime.now(UTC)
    }
    token = jwt.encode(payload, secret, algorithm="HS256")
    
    user = gateway.get_user_from_token(token)
    assert user is not None
    assert str(user.id) == user_id
    assert user.email == "test@example.com"
    assert user.name == "Test User"

def test_get_user_from_token_invalid():
    secret = "super-secret-jwt-token-with-at-least-32-characters-long"
    os.environ["SUPABASE_JWT_SECRET"] = secret
    gateway = SupabaseAuthGateway()
    
    token = "invalid.token.here"
    
    user = gateway.get_user_from_token(token)
    assert user is None

def test_get_current_user_no_context():
    gateway = SupabaseAuthGateway()
    user = gateway.get_current_user()
    assert user is None
