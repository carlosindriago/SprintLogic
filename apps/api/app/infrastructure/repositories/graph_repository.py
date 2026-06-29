from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select

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

    async def get_all_nodes(self) -> List[GraphNode]:
        result = await self.session.execute(select(GraphNodeModel))
        models = result.scalars().all()
        return [
            GraphNode(id=m.id, label=m.label, name=m.name, file_path=m.file_path)
            for m in models
        ]

    async def get_all_edges(self) -> List[GraphEdge]:
        result = await self.session.execute(select(GraphEdgeModel))
        models = result.scalars().all()
        return [
            GraphEdge(source_id=m.source_id, target_id=m.target_id, type=m.type)
            for m in models
        ]
