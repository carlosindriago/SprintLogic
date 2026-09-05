import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.models import OmniNoteModel
from app.infrastructure.llm.audio_gateway import transcribe_audio

router = APIRouter(prefix="/omni-pad", tags=["omni-pad"])


class OmniNoteCreate(BaseModel):
    content: str
    project_id: uuid.UUID | None = None


class OmniNoteResponse(BaseModel):
    id: uuid.UUID
    content: str
    project_id: uuid.UUID | None
    created_at: str

    model_config = ConfigDict(from_attributes=True)


@router.get("/notes", response_model=list[OmniNoteResponse])
async def get_omni_notes(
    project_id: uuid.UUID | None = None, session: AsyncSession = Depends(get_db_session)
):
    stmt = select(OmniNoteModel).order_by(OmniNoteModel.created_at.desc())
    if project_id:
        stmt = stmt.where(OmniNoteModel.project_id == project_id)

    result = await session.execute(stmt)
    notes = result.scalars().all()

    return [
        OmniNoteResponse(
            id=note.id,
            content=note.content,
            project_id=note.project_id,
            created_at=note.created_at.isoformat(),
        )
        for note in notes
    ]


@router.post("/notes", response_model=OmniNoteResponse)
async def create_omni_note(
    payload: OmniNoteCreate, session: AsyncSession = Depends(get_db_session)
):
    note = OmniNoteModel(id=uuid.uuid4(), content=payload.content, project_id=payload.project_id)
    session.add(note)
    await session.commit()
    await session.refresh(note)

    return OmniNoteResponse(
        id=note.id,
        content=note.content,
        project_id=note.project_id,
        created_at=note.created_at.isoformat(),
    )


class TranscribeResponse(BaseModel):
    text: str


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio_endpoint(file: UploadFile = File(...)):
    # Lee los bytes directamente en memoria
    file_bytes = await file.read()

    # Transcribe usando el gateway de audio
    transcription_text = await transcribe_audio(file_bytes, filename=file.filename or "audio.webm")

    return TranscribeResponse(text=transcription_text)
