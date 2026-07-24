from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from datetime import datetime

class PromptBase(BaseModel):
    description: Optional[str] = None
    content: str
    required_variables: Optional[List[str]] = None

class PromptCreate(PromptBase):
    id: str

class PromptUpdate(BaseModel):
    content: Optional[str] = None
    description: Optional[str] = None
    required_variables: Optional[List[str]] = None

class PromptResponse(PromptBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class PromptPatchRequest(BaseModel):
    current_content: str
