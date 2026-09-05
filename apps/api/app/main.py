import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.infrastructure.file_watcher import file_watcher
from app.interfaces.api.v1.ai import router as ai_router
from app.interfaces.api.v1.chat import router as chat_router
from app.interfaces.api.v1.db_studio import router as db_studio_router
from app.interfaces.api.v1.doc_studio import router as doc_studio_router
from app.interfaces.api.v1.editor import router as editor_router
from app.interfaces.api.v1.execution import router as execution_router
from app.interfaces.api.v1.git import router as git_router
from app.interfaces.api.v1.kanban import router as kanban_router
from app.interfaces.api.v1.legal_studio import router as legal_studio_router
from app.interfaces.api.v1.lsp import router as lsp_router
from app.interfaces.api.v1.omni_pad import router as omni_pad_router
from app.interfaces.api.v1.planning_studio import router as planning_studio_router
from app.interfaces.api.v1.projects import router as projects_router
from app.interfaces.api.v1.projects.ws import file_watcher_callback
from app.interfaces.api.v1.prompts import router as prompts_router
from app.interfaces.api.v1.providers import router as providers_router
from app.interfaces.api.v1.security_studio import router as security_studio_router
from app.interfaces.api.v1.settings import router as settings_router
from app.interfaces.api.v1.sync import router as sync_router
from app.interfaces.api.v1.telemetry import router as telemetry_router
from app.interfaces.api.v1.test_studio import router as test_studio_router

# Wires external tasks.md changes (another tab, a `git pull`, a hand edit, an
# external agent editing the file directly) into the /projects/{id}/events
# SSE stream the Kanban board listens on. file_watcher, the SSE endpoint and
# the frontend listener already existed - this registration was the missing
# piece connecting them, so the board never live-refreshed on external edits.
file_watcher.add_callback(file_watcher_callback)

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
from pathlib import Path

# Determine base directory (PyInstaller vs Dev). Used both by the Alembic
# migration bootstrap below and to locate the bundled frontend static
# assets further down this file.
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    # Running in a PyInstaller bundle (--onedir uses sys._MEIPASS too)
    base_dir = Path(sys._MEIPASS)
else:
    # Running in normal Python environment
    base_dir = Path(__file__).resolve().parent.parent


# The last revision whose upgrade() only ALTERs a schema that
# Base.metadata.create_all() already fully produces from the current ORM
# models. Update this when (and only when) a new migration is added that
# also fits that pattern *and* every migration after it up to the new one
# does too — the moment a migration does something create_all cannot
# (creates a FTS5 virtual table, drops a column SQLAlchemy can't express,
# etc.), leave this constant where it is so that migration keeps running
# for real instead of being silently stamped past on a fresh install.
_CREATE_ALL_BASELINE_REVISION = "5f7aa4b1b973"


def _run_migrations_bootstrap_sync(base_dir: Path, database_url: str) -> None:
    """Bring the SQLite schema up to Alembic's ``head``.

    ``Base.metadata.create_all`` (run just before this, in ``lifespan``)
    only ever creates tables that don't exist yet — it never applies the
    column/table changes tracked in migrations/versions/. Without this
    step, updating the app on top of an existing user database can leave
    it missing columns that a later revision added (e.g.
    add_test_status_to_kanban_tickets), causing "no such column" errors.

    Revisions up to and including ``_CREATE_ALL_BASELINE_REVISION`` only
    ever ALTER a schema that create_all already produced (add a column/
    table matching the current ORM models) — so a database with no
    ``alembic_version`` table yet (a brand new install, or a pre-existing
    "legacy" database from before this fix) is, by construction, already
    shaped like that baseline once create_all has run, and gets *stamped*
    there rather than having every ALTER replayed (which would fail on
    columns that already exist). Any revision *after* the baseline may do
    something create_all cannot (e.g. 7ce3aee9d476 creates FTS5 virtual
    tables, which aren't representable as ORM models at all) and must
    actually run via ``upgrade head`` even on a fresh database — stamping
    straight to "head" would silently skip it, leaving those tables never
    created. Once a database is fully stamped/upgraded, subsequent app
    updates naturally apply any further migration via ``upgrade head``.
    """
    from alembic import command
    from alembic.config import Config
    from sqlalchemy.engine import make_url

    alembic_ini = base_dir / "alembic.ini"
    if not alembic_ini.exists():
        logging.warning(
            "alembic.ini not found at %s — skipping migration bootstrap", alembic_ini
        )
        return

    cfg = Config(str(alembic_ini))
    cfg.set_main_option("script_location", str(base_dir / "migrations"))
    cfg.set_main_option("sqlalchemy.url", database_url)

    db_path = make_url(database_url).database
    already_versioned = False
    if db_path and os.path.exists(db_path):
        import sqlite3

        conn = sqlite3.connect(db_path)
        try:
            row = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'"
            ).fetchone()
            already_versioned = row is not None
        finally:
            conn.close()

    if already_versioned:
        command.upgrade(cfg, "head")
    else:
        command.stamp(cfg, _CREATE_ALL_BASELINE_REVISION)
        command.upgrade(cfg, "head")


def kill_zombie_on_parent_death():
    """Cordón umbilical STDIN: detecta cuando el proceso padre (Tauri) muere.

    Cuando Tauri cierra, su proceso principal termina y el pipe de STDIN
    hacia este hijo Python se rompe — sys.stdin.read() devuelve EOF.
    En ese momento enviamos SIGINT a nosotros mismos para que uvicorn
    ejecute el shutdown graceful (lifespan teardown, insight_worker cierre,
    process_pool.shutdown). Sin esto, el proceso Python queda huérfano
    en RAM consumiendo recursos.
    """
    try:
        sys.stdin.read()
    except Exception:
        logging.warning("Unhandled exception", exc_info=True)
    print("Parent process died (STDIN EOF). Initiating graceful shutdown...", file=sys.stderr)
    os.kill(os.getpid(), signal.SIGINT)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Activar el asesino de Zombis (Cordón umbilical STDIN) solo cuando
    # estamos bajo Tauri (modo desktop). SPRINTLOGIC_DESKTOP=1 lo configura
    # lib.rs al spawn del sidecar. En dev puro (sin Tauri) no queremos
    # que un Ctrl-C en la terminal dispare shutdown espurio.
    if os.getenv("SPRINTLOGIC_DESKTOP") == "1":
        threading.Thread(target=kill_zombie_on_parent_death, daemon=True).start()

    # Startup
    import asyncio

    from app.infrastructure.db.database import DATABASE_URL, Base, get_engine, get_sessionmaker
    from app.infrastructure.repositories.prompt_repository import initialize_prompts

    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Run in a thread: Alembic's env.py drives its own asyncio.run(), which
    # cannot be nested inside this already-running event loop.
    await asyncio.to_thread(_run_migrations_bootstrap_sync, base_dir, DATABASE_URL)

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        await initialize_prompts(session)

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
        logging.warning("Unhandled exception: %s", e, exc_info=True)
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
    allow_origins=["tauri://localhost", "http://localhost:3420", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Minimal security headers, defense in depth. Matters most in `--web`
# fallback mode (see start_dev.sh), where this server serves the frontend
# directly to a plain browser at http://localhost:<port> with none of
# Tauri's own CSP (tauri.conf.json) in effect — that CSP only applies
# inside the Tauri-managed webview. Harmless on API/JSON responses too.
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    # Mirrors tauri.conf.json's CSP (including style-src 'unsafe-inline',
    # required for the app's inline styles — see item #10's fix).
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; connect-src 'self'"
    )
    return response


app.include_router(projects_router, prefix="/api/v1")
app.include_router(kanban_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1/settings")
app.include_router(providers_router, prefix="/api/v1/providers")
app.include_router(telemetry_router, prefix="/api/v1/telemetry")
app.include_router(chat_router, prefix="/api/v1/chat")
app.include_router(git_router, prefix="/api/v1/projects")
app.include_router(lsp_router, prefix="/api/v1/lsp")
app.include_router(editor_router, prefix="/api/v1/editor")
app.include_router(ai_router, prefix="/api/v1/ai")
app.include_router(sync_router, prefix="/api/v1/sync")
app.include_router(prompts_router, prefix="/api/v1")
app.include_router(planning_studio_router, prefix="/api/v1/planning-studio")
app.include_router(db_studio_router, prefix="/api/v1")
app.include_router(test_studio_router, prefix="/api/v1")
app.include_router(doc_studio_router, prefix="/api/v1")
app.include_router(security_studio_router, prefix="/api/v1")
app.include_router(legal_studio_router, prefix="/api/v1")
app.include_router(omni_pad_router, prefix="/api/v1")
app.include_router(execution_router, prefix="/api/v1")


from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


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
