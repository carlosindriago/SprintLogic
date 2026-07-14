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
from app.interfaces.api.v1.telemetry import router as telemetry_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    stream=sys.stderr,
)

import os
import signal
import threading
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager


def kill_zombie_on_parent_death():
    try:
        sys.stdin.read()
    except Exception:
        pass
    print("Parent process died (STDIN EOF). Initiating graceful shutdown...", file=sys.stderr)
    os.kill(os.getpid(), signal.SIGINT)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Activar el asesino de Zombis (Cordón umbilical STDIN) solo en prod/Tauri
    if os.getenv("SPRINTLOGIC_DESKTOP") == "1":
        threading.Thread(target=kill_zombie_on_parent_death, daemon=True).start()

    # Startup
    await init_fts5()
    # Initialize the CPU-bound process pool
    # Use max_workers=2 to avoid killing small developer machines, but you can use multiprocessing.cpu_count() - 1
    app.state.process_pool = ProcessPoolExecutor(max_workers=2)
    yield
    # Shutdown
    app.state.process_pool.shutdown(wait=True)

app = FastAPI(title="sprintLogic API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1/settings")
app.include_router(telemetry_router, prefix="/api/v1/telemetry")
app.include_router(chat_router, prefix="/api/v1/chat")
app.include_router(git_router, prefix="/api/v1/projects")
app.include_router(lsp_router, prefix="/api/v1/lsp")
app.include_router(editor_router, prefix="/api/v1/editor")
app.include_router(ai_router, prefix="/api/v1/ai")


from pathlib import Path

from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}

# Determine base directory (PyInstaller vs Dev)
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    # Running in a PyInstaller bundle (--onedir uses sys._MEIPASS too)
    base_dir = Path(sys._MEIPASS)
else:
    # Running in normal Python environment
    base_dir = Path(__file__).resolve().parent.parent

static_dir = base_dir / "static"
next_assets_dir = static_dir / "_next"

# Create dirs if they don't exist to prevent FastAPI crash in pure dev mode
if not static_dir.exists():
    static_dir.mkdir(parents=True, exist_ok=True)
if not next_assets_dir.exists():
    next_assets_dir.mkdir(parents=True, exist_ok=True)

# Mount Next.js _next assets explicitly to ensure they are served correctly
app.mount("/_next", StaticFiles(directory=str(next_assets_dir)), name="next_assets")

# Catch-all for API routes BEFORE mounting StaticFiles to prevent returning Next.js 404.html
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def api_catch_all(request, path: str):
    return JSONResponse({"detail": "Not Found"}, status_code=404)

# Mount root static files (HTML, favicon, etc)
app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")

@app.exception_handler(404)
async def custom_404_handler(request, exc):
    # Only serve index.html for non-API routes (SPA Catch-All)
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)

    index_file = static_dir / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return JSONResponse({"detail": "Frontend not found"}, status_code=404)

if __name__ == "__main__":
    import multiprocessing

    import uvicorn
    # When running via PyInstaller, multiprocessing needs this to prevent fork bombs
    multiprocessing.freeze_support()
    uvicorn.run(app, host="127.0.0.1", port=8000)
