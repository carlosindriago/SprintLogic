from pydantic import BaseModel


class GitRepository(BaseModel):
    id: int | None = None
    path: str
    name: str


class GitBranch(BaseModel):
    name: str
    is_active: bool


class GitCommit(BaseModel):
    hash: str
    message: str
    author: str
    timestamp: str
