from dataclasses import dataclass
from enum import Enum

class NodeLabel(str, Enum):
    FILE = "File"
    CLASS = "Class"
    FUNCTION = "Function"

class EdgeType(str, Enum):
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

@dataclass
class GraphEdge:
    project_id: UUID
    source_id: str
    target_id: str
    type: EdgeType
