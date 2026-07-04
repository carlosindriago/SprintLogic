class DomainError(Exception):
    pass


class SecurityError(DomainError):
    pass


class PathBlockedError(SecurityError):
    def __init__(self, path: str, reason: str):
        self.path = path
        self.reason = reason
        super().__init__(f"Path blocked: {path} — {reason}")


class GitOperationError(DomainError):
    def __init__(self, message: str, repo_path: str, command: str = ""):
        self.repo_path = repo_path
        self.command = command
        super().__init__(message)


class ScannerError(DomainError):
    def __init__(self, message: str, repo_path: str = ""):
        self.repo_path = repo_path
        super().__init__(message)
