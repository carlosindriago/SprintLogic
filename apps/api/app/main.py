import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.infrastructure.db.database import init_fts5
from app.interfaces.api.v1.ai import router as ai_router
from app.interfaces.api.v1.chat import router as chat_router
from app.interfaces.api.v1.editor import router as editor_router
from app.interfaces.api.v1.git import router as git_router
from app.interfaces.api.v1.lsp import router as lsp_router
from app.interfaces.api.v1.projects import router as projects_router
from app.interfaces.api.v1.settings import router as settings_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    stream=sys.stderr,
)

app = FastAPI(title="sprintLogic API")


@app.on_event("startup")
async def startup() -> None:
    await init_fts5()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1/settings")
app.include_router(chat_router, prefix="/api/v1/chat")
app.include_router(git_router, prefix="/api/v1/projects")
app.include_router(lsp_router, prefix="/api/v1/lsp")
app.include_router(editor_router, prefix="/api/v1/editor")
app.include_router(ai_router, prefix="/api/v1/ai")


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
