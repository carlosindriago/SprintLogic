import pytest
from uuid import uuid4
from app.domain.graph_models import EdgeType
from app.application.analyze_blast_radius import AnalyzeBlastRadiusUseCase

class DummyProjectRepo:
    pass

class DummyGraphRepo:
    async def get_blast_radius(self, project_id, target_node_id, max_depth=2):
        if target_node_id == "file:error":
            raise Exception("DB Error")
        if target_node_id == "file:empty":
            return []
        return [
            {"depth": 1, "edge_type": EdgeType.API_CALL, "source_file_path": "frontend/app.ts", "source_id": "file:frontend/app.ts"},
            {"depth": 1, "edge_type": EdgeType.IMPORTS, "source_file_path": "backend/controller.py", "source_id": "file:backend/controller.py"},
            {"depth": 2, "edge_type": EdgeType.IMPORTS, "source_file_path": "backend/router.py", "source_id": "file:backend/router.py"}
        ]

    async def get_nodes_by_project(self, project_id):
        class Node:
            def __init__(self, id, file_path):
                self.id = id
                self.file_path = file_path
        return [Node("file:target", "target")]

@pytest.mark.asyncio
async def test_analyze_blast_radius_empty():
    repo = DummyGraphRepo()
    use_case = AnalyzeBlastRadiusUseCase(repo, DummyProjectRepo())
    res = await use_case.execute(uuid4(), "file:empty", max_depth=2)
    assert "<info>No dependencies found.</info>" in res

@pytest.mark.asyncio
async def test_analyze_blast_radius_success():
    repo = DummyGraphRepo()
    use_case = AnalyzeBlastRadiusUseCase(repo, DummyProjectRepo())
    res = await use_case.execute(uuid4(), "file:target", max_depth=2)
    assert "<blast_radius target=\"file:target\"" in res
    assert "<impact_layer depth=\"1\">" in res
    assert "<api_impact>" in res
    assert "frontend/app.ts (Type: API_CALL)" in res
    assert "<direct_impact>" in res
    assert "backend/controller.py (Type: IMPORTS)" in res
    assert "<impact_layer depth=\"2\">" in res
    assert "backend/router.py (Type: IMPORTS)" in res

