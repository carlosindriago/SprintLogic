import pytest
from app.application.scan_codebase import ScanCodebaseUseCase
from app.domain.graph_repository import GraphRepository
from app.domain.graph_models import GraphNode, GraphEdge
from typing import List

class FakeGraphRepository(GraphRepository):
    def __init__(self):
        self.nodes = []
        self.edges = []
        self.cleared = False
        
    async def save_nodes(self, nodes: List[GraphNode]) -> None:
        self.nodes.extend(nodes)
        
    async def save_edges(self, edges: List[GraphEdge]) -> None:
        self.edges.extend(edges)
        
    async def clear_all(self) -> None:
        self.cleared = True
        self.nodes = []
        self.edges = []

class FakeParserService:
    def parse_directory(self, dir_path: str):
        return ["node1", "node2"], ["edge1"]

@pytest.mark.asyncio
async def test_scan_codebase_orchestration():
    repo = FakeGraphRepository()
    parser = FakeParserService()
    
    usecase = ScanCodebaseUseCase(parser=parser, repository=repo) # type: ignore
    
    await usecase.execute("fake/dir")
    
    assert repo.cleared is True
    assert repo.nodes == ["node1", "node2"]
    assert repo.edges == ["edge1"]
