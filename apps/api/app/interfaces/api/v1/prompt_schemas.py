from datetime import datetime

from pydantic import BaseModel


class PromptBase(BaseModel):
    description: str | None = None
    content: str
    required_variables: list[str] | None = None


class PromptCreate(PromptBase):
    id: str


class PromptUpdate(BaseModel):
    content: str | None = None
    description: str | None = None
    required_variables: list[str] | None = None


class PromptResponse(PromptBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PromptPatchRequest(BaseModel):
    current_content: str
