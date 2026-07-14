from dataclasses import dataclass
from enum import StrEnum


class NodeLabel(StrEnum):
    FILE = "File"
    CLASS = "Class"
    FUNCTION = "Function"


class EdgeType(StrEnum):
    IMPORTS = "IMPORTS"
    CALLS = "CALLS"
    CONTAINS = "CONTAINS"


from uuid import UUID


@dataclass
class GraphNode:
    id: str
    project_id: UUID
    label: NodeLabel
    name: str
    file_path: str
    meta_data: str = "{}"
    file_size: int | None = None
    loc: int | None = None


@dataclass
class GraphEdge:
    project_id: UUID
    source_id: str
    target_id: str
    type: EdgeType
