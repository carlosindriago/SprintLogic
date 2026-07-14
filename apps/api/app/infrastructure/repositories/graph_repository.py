from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.graph_models import GraphEdge, GraphNode
from app.domain.graph_repository import GraphRepository
from app.infrastructure.db.models import GraphEdgeModel, GraphNodeModel


class SQLAlchemyGraphRepository(GraphRepository):
    def __init__(self, session: AsyncSession):
        self.session = session

    async def save_nodes(self, nodes: list[GraphNode]) -> None:
        for node in nodes:
            node_model = GraphNodeModel(
                id=node.id,
                project_id=node.project_id,
                label=node.label,
                name=node.name,
                file_path=node.file_path,
                meta_data=node.meta_data,
                file_size=node.file_size,
                loc=node.loc,
            )
            self.session.add(node_model)
        await self.session.commit()

    async def save_edges(self, edges: list[GraphEdge]) -> None:
        for edge in edges:
            edge_model = GraphEdgeModel(
                project_id=edge.project_id,
                source_id=edge.source_id,
                target_id=edge.target_id,
                type=edge.type,
            )
            self.session.add(edge_model)
        await self.session.commit()

    async def clear_by_project(self, project_id: UUID) -> None:
        await self.session.execute(
            delete(GraphEdgeModel).where(GraphEdgeModel.project_id == project_id)
        )
        await self.session.execute(
            delete(GraphNodeModel).where(GraphNodeModel.project_id == project_id)
        )
        await self.session.commit()

    async def get_nodes_by_project(self, project_id: UUID) -> list[GraphNode]:
        result = await self.session.execute(
            select(GraphNodeModel).where(GraphNodeModel.project_id == project_id)
        )
        models = result.scalars().all()
        return [
            GraphNode(
                id=m.id, project_id=m.project_id, label=m.label, name=m.name,
                file_path=m.file_path, meta_data=m.meta_data or "{}",
                file_size=m.file_size, loc=m.loc,
            )
            for m in models
        ]

    async def get_edges_by_project(self, project_id: UUID) -> list[GraphEdge]:
        result = await self.session.execute(
            select(GraphEdgeModel).where(GraphEdgeModel.project_id == project_id)
        )
        models = result.scalars().all()
        return [
            GraphEdge(
                project_id=m.project_id, source_id=m.source_id, target_id=m.target_id, type=m.type
            )
            for m in models
        ]
