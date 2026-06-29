import os
import jwt
from typing import Optional
from uuid import UUID
from app.domain.user import User
from app.interfaces.auth_gateway import AuthGateway

class SupabaseAuthGateway(AuthGateway):
    def get_user_from_token(self, token: str) -> Optional[User]:
        secret = os.environ.get("SUPABASE_JWT_SECRET")
        if not secret:
            return None
        
        try:
            # Supabase tokens are signed with HS256 using the JWT_SECRET
            payload = jwt.decode(
                token, 
                secret, 
                algorithms=["HS256"],
                options={"verify_aud": False}
            )
            
            user_id = payload.get("sub")
            email = payload.get("email")
            user_metadata = payload.get("user_metadata", {})
            name = user_metadata.get("name", "Unknown User")
            
            if not user_id or not email:
                return None
                
            return User(
                id=UUID(user_id),
                email=email,
                name=name
            )
        except (jwt.PyJWTError, ValueError):
            return None

    def get_current_user(self) -> Optional[User]:
        # Typically in FastAPI this will be injected or not needed from the gateway,
        # but required by the interface for now.
        return None
