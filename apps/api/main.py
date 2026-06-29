from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.interfaces.api.v1.projects import router as projects_router

app = FastAPI(title="sprintLogic API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "tauri://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router, prefix="/api/v1")


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
