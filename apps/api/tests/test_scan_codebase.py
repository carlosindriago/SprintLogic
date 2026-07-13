import pytest

from app.application.scan_codebase import ScanCodebaseUseCase
from app.domain.graph_models import GraphEdge, GraphNode
from app.domain.graph_repository import GraphRepository

from app.domain.ports.language_analyzer import LanguageAnalyzerStrategy

class FakeStrategy(LanguageAnalyzerStrategy):
    def is_compatible(self, path: Path) -> bool:
        return True

    async def parse_dependencies(self, path: Path) -> dict:
        return {
            "nodes": [{"id": "node1", "label": "node1"}],
            "edges": [{"source": "node1", "target": "node2"}]
        }

    async def parse_skeletons(self, base_path: Path, files: list[str]) -> dict:
        return {"node1": "def fake_skeleton(): pass"}

@pytest.mark.asyncio
async def test_scan_codebase_orchestration():
    strategy = FakeStrategy()
    usecase = ScanCodebaseUseCase(strategies=[strategy])

    result = await usecase.execute("fake/dir")

    assert "metrics" in result
    assert "skeletons" in result
    assert result["nodes"] == [{"id": "node1", "label": "node1"}]
    assert result["edges"] == [{"source": "node1", "target": "node2"}]

