from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BlastRadiusItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    source_id: str = Field(description="ID del nodo afectado que depende del objetivo")
    target_id: str = Field(description="ID del nodo del cual depende")
    source_file_path: str = Field(description="Ruta del archivo afectado")
    edge_type: str = Field(description="Tipo de relación (IMPORTS, API_CALL, CALLS)")
    depth: int = Field(description="Nivel de profundidad/distancia desde el objetivo inicial")


class BlastRadiusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: UUID
    target_node_id: str
    target_file_path: str
    max_depth: int
    total_affected_files: int
    items: list[BlastRadiusItem]
    grouped_by_depth: dict[int, list[BlastRadiusItem]]
