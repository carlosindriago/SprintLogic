from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class GitRepository(BaseModel):
    id: Optional[int] = None
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
