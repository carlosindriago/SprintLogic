import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.interfaces.api.v1.ai import router as ai_router
from app.interfaces.api.v1.chat import router as chat_router
from app.interfaces.api.v1.editor import router as editor_router
from app.interfaces.api.v1.git import router as git_router
from app.interfaces.api.v1.lsp import router as lsp_router
from app.interfaces.api.v1.projects import router as projects_router
from app.interfaces.api.v1.settings import router as settings_router
from app.interfaces.api.v1.sync import router as sync_router
from app.interfaces.api.v1.telemetry import router as telemetry_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    stream=sys.stderr,
)

import os
import signal
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
    # if os.getenv("SPRINTLOGIC_DESKTOP") == "1":
    #     threading.Thread(target=kill_zombie_on_parent_death, daemon=True).start()


    # Startup
    try:
        app.state.process_pool = ProcessPoolExecutor(max_workers=2)

        from app.application.insight_worker import run_insight_worker_loop
        from app.application.telemetry_daemon import TelemetryDaemon
        from app.infrastructure.events.event_bus import global_event_bus

        app.state.telemetry_daemon = TelemetryDaemon(global_event_bus)

        # Iniciar REM Sleep / Insight Worker
        import asyncio
        app.state.insight_worker_task = asyncio.create_task(run_insight_worker_loop())
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        raise e

    yield

    # Shutdown
    import asyncio

    from app.application.insight_worker import signal_shutdown
    signal_shutdown()

    try:
        if hasattr(app.state, "insight_worker_task"):
            await asyncio.wait_for(app.state.insight_worker_task, timeout=10.0)
    except TimeoutError:
        print("Insight worker shutdown timed out, cancelling.")
        app.state.insight_worker_task.cancel()

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
app.include_router(sync_router, prefix="/api/v1/sync")


from pathlib import Path

from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


# Determine base directory (PyInstaller vs Dev)
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
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
    import socket
    import sys

    import uvicorn

    # When running via PyInstaller, multiprocessing needs this to prevent fork bombs
    multiprocessing.freeze_support()

    # Dynamic Port Allocation (No TOCTOU)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    # Bind to port 0 to let the OS assign a free ephemeral port
    sock.bind(("127.0.0.1", 0))
    assigned_port = sock.getsockname()[1]

    # The IPC handshake signature for Tauri
    print(f"[SPRINTLOGIC_READY::{assigned_port}]", flush=True)

    # Pass the socket's file descriptor directly to Uvicorn
    # This prevents anyone from stealing the port between check and use
    config = uvicorn.Config(app, fd=sock.fileno())
    server = uvicorn.Server(config)
    server.run()
