from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.infrastructure.db.models import GraphEdgeModel, GraphNodeModel


class BlastRadiusArgs(BaseModel):
    file_path: str = Field(
        ..., description="La ruta relativa del archivo en el repositorio (ej. 'src/main.ts')."
    )


async def get_file_blast_radius(session: AsyncSession, project_id: UUID, file_path: str) -> dict:
    """
    Calculates the blast radius of a file by finding its in_degree, out_degree,
    and a list of files that directly import it.
    """
    # Find the node
    node_stmt = select(GraphNodeModel).where(
        GraphNodeModel.project_id == project_id, GraphNodeModel.file_path == file_path
    )
    result = await session.execute(node_stmt)
    node = result.scalars().first()

    if not node:
        return {"error": f"No se encontró el archivo '{file_path}' en el grafo del proyecto."}

    node_id = node.id

    # In-degree (files that import this node)
    in_degree_stmt = select(func.count(GraphEdgeModel.target_id)).where(
        GraphEdgeModel.project_id == project_id, GraphEdgeModel.target_id == node_id
    )
    in_result = await session.execute(in_degree_stmt)
    in_degree = in_result.scalar() or 0

    # Out-degree (files that this node imports)
    out_degree_stmt = select(func.count(GraphEdgeModel.source_id)).where(
        GraphEdgeModel.project_id == project_id, GraphEdgeModel.source_id == node_id
    )
    out_result = await session.execute(out_degree_stmt)
    out_degree = out_result.scalar() or 0

    # Find who imports this (target_id = node_id, we want the source files)
    importers_stmt = (
        select(GraphNodeModel.file_path)
        .join(GraphEdgeModel, GraphEdgeModel.source_id == GraphNodeModel.id)
        .where(GraphEdgeModel.project_id == project_id, GraphEdgeModel.target_id == node_id)
    )
    importers_result = await session.execute(importers_stmt)
    importers = importers_result.scalars().all()

    return {
        "file_path": file_path,
        "in_degree": in_degree,
        "out_degree": out_degree,
        "importers": list(importers),
    }
