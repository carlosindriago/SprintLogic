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
        import asyncio
        batch_size = 5000
        for i in range(0, len(nodes), batch_size):
            batch = nodes[i:i + batch_size]
            for node in batch:
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
            await asyncio.sleep(0)

    async def save_edges(self, edges: list[GraphEdge]) -> None:
        import asyncio
        batch_size = 5000
        for i in range(0, len(edges), batch_size):
            batch = edges[i:i + batch_size]
            for edge in batch:
                edge_model = GraphEdgeModel(
                    project_id=edge.project_id,
                    source_id=edge.source_id,
                    target_id=edge.target_id,
                    type=edge.type,
                )
                self.session.add(edge_model)
            await self.session.commit()
            await asyncio.sleep(0)

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

    async def get_blast_radius(
        self, project_id: UUID, target_node_id: str, max_depth: int = 2
    ) -> list[dict]:
        from sqlalchemy import text

        query = text("""
            WITH RECURSIVE blast_radius AS (
                SELECT e.source_id, e.target_id, e.type as edge_type, 1 as depth
                FROM graph_edges e
                WHERE e.target_id = :initial_node_id AND e.project_id = :project_id

                UNION ALL

                SELECT e.source_id, e.target_id, e.type as edge_type, b.depth + 1
                FROM graph_edges e
                INNER JOIN blast_radius b ON e.target_id = b.source_id
                WHERE b.depth < :max_depth AND e.project_id = :project_id
            )
            SELECT b.source_id, b.target_id, b.edge_type, b.depth, n.file_path
            FROM blast_radius b
            LEFT JOIN graph_nodes n ON b.source_id = n.id AND n.project_id = :project_id
        """)

        # Let SQLAlchemy handle the UUID parameter binding correctly.
        result = await self.session.execute(
            query,
            {
                "initial_node_id": target_node_id,
                "project_id": project_id.hex,  # SQLite UUID is often stored as hex, but wait, SQLAlchemy handles UUID natively.
                "max_depth": max_depth,
            }
        )

        rows = result.fetchall()
        return [
            {
                "source_id": row[0],
                "target_id": row[1],
                "edge_type": row[2],
                "depth": row[3],
                "source_file_path": row[4],
            }
            for row in rows
        ]
