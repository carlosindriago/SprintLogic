class DomainError(Exception):
    pass


class SecurityError(DomainError):
    pass


class PathBlockedError(SecurityError):
    def __init__(self, path: str, reason: str):
        self.path = path
        self.reason = reason
        super().__init__(f"Path blocked: {path} — {reason}")
