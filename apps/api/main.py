from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.interfaces.api.v1.projects import router as projects_router
from app.interfaces.api.v1.settings import router as settings_router
from app.interfaces.api.v1.chat import router as chat_router

app = FastAPI(title="sprintLogic API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "tauri://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1/settings")
app.include_router(chat_router, prefix="/api/v1/chat")


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
