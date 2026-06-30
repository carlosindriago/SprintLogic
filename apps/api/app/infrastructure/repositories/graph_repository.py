from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select

from app.domain.graph_models import GraphNode, GraphEdge
from app.domain.graph_repository import GraphRepository
from app.infrastructure.db.models import GraphNodeModel, GraphEdgeModel

from uuid import UUID

class SQLAlchemyGraphRepository(GraphRepository):
    def __init__(self, session: AsyncSession):
        self.session = session
        
    async def save_nodes(self, nodes: List[GraphNode]) -> None:
        for node in nodes:
            node_model = GraphNodeModel(
                id=node.id,
                project_id=node.project_id,
                label=node.label,
                name=node.name,
                file_path=node.file_path
            )
            self.session.add(node_model)
        await self.session.commit()
            
    async def save_edges(self, edges: List[GraphEdge]) -> None:
        for edge in edges:
            edge_model = GraphEdgeModel(
                project_id=edge.project_id,
                source_id=edge.source_id,
                target_id=edge.target_id,
                type=edge.type
            )
            self.session.add(edge_model)
        await self.session.commit()
        
    async def clear_by_project(self, project_id: UUID) -> None:
        await self.session.execute(delete(GraphEdgeModel).where(GraphEdgeModel.project_id == project_id))
        await self.session.execute(delete(GraphNodeModel).where(GraphNodeModel.project_id == project_id))
        await self.session.commit()

    async def get_nodes_by_project(self, project_id: UUID) -> List[GraphNode]:
        result = await self.session.execute(select(GraphNodeModel).where(GraphNodeModel.project_id == project_id))
        models = result.scalars().all()
        return [
            GraphNode(id=m.id, project_id=m.project_id, label=m.label, name=m.name, file_path=m.file_path)
            for m in models
        ]

    async def get_edges_by_project(self, project_id: UUID) -> List[GraphEdge]:
        result = await self.session.execute(select(GraphEdgeModel).where(GraphEdgeModel.project_id == project_id))
        models = result.scalars().all()
        return [
            GraphEdge(project_id=m.project_id, source_id=m.source_id, target_id=m.target_id, type=m.type)
            for m in models
        ]
