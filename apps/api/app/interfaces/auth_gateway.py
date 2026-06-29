from abc import ABC, abstractmethod
from typing import Optional
from app.domain.user import User

class AuthGateway(ABC):
    @abstractmethod
    def get_user_from_token(self, token: str) -> Optional[User]:
        raise NotImplementedError

    @abstractmethod
    def get_current_user(self) -> Optional[User]:
        raise NotImplementedError
