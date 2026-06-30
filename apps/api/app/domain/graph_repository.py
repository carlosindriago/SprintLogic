from typing import List, Protocol
from app.domain.graph_models import GraphNode, GraphEdge

from uuid import UUID

class GraphRepository(Protocol):
    async def save_nodes(self, nodes: List[GraphNode]) -> None:
        ...
        
    async def save_edges(self, edges: List[GraphEdge]) -> None:
        ...
        
    async def clear_by_project(self, project_id: UUID) -> None:
        ...

    async def get_nodes_by_project(self, project_id: UUID) -> List[GraphNode]:
        ...

    async def get_edges_by_project(self, project_id: UUID) -> List[GraphEdge]:
        ...
