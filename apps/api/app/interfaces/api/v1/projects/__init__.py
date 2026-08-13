from fastapi import APIRouter

from .core import router as core_router
from .files import router as files_router
from .graph import router as graph_router
from .insights import router as insights_router
from .kanban import router as kanban_router
from .memory import router as memory_router
from .reports import router as reports_router
from .ws import router as ws_router

router = APIRouter()
router.include_router(core_router)
router.include_router(files_router)
router.include_router(graph_router)
router.include_router(reports_router)
router.include_router(kanban_router)
router.include_router(insights_router)
router.include_router(memory_router)
router.include_router(ws_router)
