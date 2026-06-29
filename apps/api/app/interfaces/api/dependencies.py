from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.interfaces.auth_gateway import AuthGateway
from app.infrastructure.auth.supabase_auth_gateway import SupabaseAuthGateway
from app.domain.user import User

security = HTTPBearer()

def get_auth_gateway() -> AuthGateway:
    return SupabaseAuthGateway()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    auth_gateway: AuthGateway = Depends(get_auth_gateway)
) -> User:
    token = credentials.credentials
    user = auth_gateway.get_user_from_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
