"""
Regresion test for the "Grafo Estelar Roto" bug: the live scan pipeline
(ScanCodebaseUseCase in app.application.scan_repo) discarded the `imports`
set returned by `extract_nodes_from_code`, so the graph only ever contained
CONTAINS edges (File -> Class/Function) and never IMPORTS edges between files.

This test proves the two-pass fix: raw import intents collected during the
per-file loop (Pass 1) are resolved against the full file universe once the
scan is complete (Pass 2), producing IMPORTS edges that connect files.
"""
import uuid
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from app.application.scan_repo import ScanCodebaseUseCase
from app.domain.graph_models import EdgeType
from app.infrastructure.events.event_bus import EventBus
from app.infrastructure.parser.ast_parser import ASTParserService
from app.infrastructure.providers.local_fs import LocalFileSystemProvider


@pytest.mark.asyncio
async def test_scan_codebase_resolves_cross_file_python_imports(tmp_path: Path):
    (tmp_path / "project_utils.py").write_text("def helper():\n    pass\n")
    (tmp_path / "main.py").write_text(
        "import project_utils\n\n\ndef run():\n    project_utils.helper()\n"
    )

    provider = LocalFileSystemProvider(str(tmp_path))
    parser = ASTParserService()
    event_bus = EventBus()
    graph_repo = AsyncMock()

    usecase = ScanCodebaseUseCase(provider, parser, event_bus, graph_repo)
    project_id = uuid.uuid4()

    await usecase.execute(project_id, project_path=str(tmp_path))

    graph_repo.clear_by_project.assert_awaited_once_with(project_id)
    graph_repo.save_edges.assert_awaited_once()
    saved_edges = graph_repo.save_edges.call_args.args[0]

    import_edges = [e for e in saved_edges if e.type == EdgeType.IMPORTS]
    assert import_edges, (
        "Expected at least one IMPORTS edge connecting main.py -> project_utils.py. "
        "If this fails, the scan pipeline is discarding cross-file imports again."
    )

    main_file_id = f"file:{tmp_path / 'main.py'}"
    utils_file_id = f"file:{tmp_path / 'project_utils.py'}"
    assert any(
        e.source_id == main_file_id and e.target_id == utils_file_id for e in import_edges
    ), "IMPORTS edge should point from the importing file to the imported file"

    # CONTAINS edges (File -> Function) must still be present; the fix must not
    # regress the pre-existing structural mapping.
    contains_edges = [e for e in saved_edges if e.type == EdgeType.CONTAINS]
    assert contains_edges


@pytest.mark.asyncio
async def test_scan_codebase_no_imports_yields_no_import_edges(tmp_path: Path):
    (tmp_path / "solo.py").write_text("def standalone():\n    pass\n")

    provider = LocalFileSystemProvider(str(tmp_path))
    parser = ASTParserService()
    event_bus = EventBus()
    graph_repo = AsyncMock()

    usecase = ScanCodebaseUseCase(provider, parser, event_bus, graph_repo)
    project_id = uuid.uuid4()

    await usecase.execute(project_id, project_path=str(tmp_path))

    saved_edges = graph_repo.save_edges.call_args.args[0]
    import_edges = [e for e in saved_edges if e.type == EdgeType.IMPORTS]
    assert import_edges == []
