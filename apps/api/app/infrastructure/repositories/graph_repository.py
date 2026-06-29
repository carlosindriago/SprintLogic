from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete

from app.domain.graph_models import GraphNode, GraphEdge
from app.domain.graph_repository import GraphRepository
from app.infrastructure.db.models import GraphNodeModel, GraphEdgeModel

class SQLAlchemyGraphRepository(GraphRepository):
    def __init__(self, session: AsyncSession):
        self.session = session
        
    async def save_nodes(self, nodes: List[GraphNode]) -> None:
        for node in nodes:
            node_model = GraphNodeModel(
                id=node.id,
                label=node.label,
                name=node.name,
                file_path=node.file_path
            )
            self.session.add(node_model)
        await self.session.commit()
            
    async def save_edges(self, edges: List[GraphEdge]) -> None:
        for edge in edges:
            edge_model = GraphEdgeModel(
                source_id=edge.source_id,
                target_id=edge.target_id,
                type=edge.type
            )
            self.session.add(edge_model)
        await self.session.commit()
        
    async def clear_all(self) -> None:
        await self.session.execute(delete(GraphEdgeModel))
        await self.session.execute(delete(GraphNodeModel))
        await self.session.commit()
