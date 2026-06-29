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

@dataclass
class GraphNode:
    id: str
    label: NodeLabel
    name: str
    file_path: str

@dataclass
class GraphEdge:
    source_id: str
    target_id: str
    type: EdgeType
