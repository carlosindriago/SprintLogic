from typing import List, Protocol
from app.domain.graph_models import GraphNode, GraphEdge

class GraphRepository(Protocol):
    async def save_nodes(self, nodes: List[GraphNode]) -> None:
        ...
        
    async def save_edges(self, edges: List[GraphEdge]) -> None:
        ...
        
    async def clear_all(self) -> None:
        ...

    async def get_all_nodes(self) -> List[GraphNode]:
        ...

    async def get_all_edges(self) -> List[GraphEdge]:
        ...
