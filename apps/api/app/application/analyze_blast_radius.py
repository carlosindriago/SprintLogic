from uuid import UUID

from app.domain.graph_models import EdgeType
from app.domain.graph_repository import GraphRepository
from app.domain.ports.project_repository import ProjectRepository


class AnalyzeBlastRadiusUseCase:
    def __init__(self, graph_repo: GraphRepository, project_repo: ProjectRepository):
        self.graph_repo = graph_repo
        self.project_repo = project_repo

    async def execute(self, project_id: UUID, target_file: str, max_depth: int = 2) -> str:
        """
        Executes the recursive CTE to find the blast radius of a target file.
        Returns the dense XML representation designed for Graph RAG context injection.
        """
        # Node IDs are prefixed with "file:"
        # e.g., "file:apps/web/src/UserService.ts"
        if not target_file.startswith("file:"):
            # Check if it's an exact match in the graph, otherwise we should search for it.
            # For this exact implementation, we assume the LLM might just pass "UserService.ts"
            # or the full path. We'll try to resolve it.

            # Simple resolution: we fetch all nodes and find the one ending with target_file
            # Or we can do a LIKE query, but for now we expect the caller to pass something resolvable.
            # To be robust, let's fetch nodes and match the path.
            nodes = await self.graph_repo.get_nodes_by_project(project_id)
            matched_node = None
            for n in nodes:
                if n.file_path.endswith(target_file) or target_file in n.file_path:
                    matched_node = n
                    break

            if not matched_node:
                return f"<error>Could not find a file matching '{target_file}' in the project graph.</error>"
            target_node_id = matched_node.id
        else:
            target_node_id = target_file

        # Fetch the blast radius from the DB CTE
        rows = await self.graph_repo.get_blast_radius(project_id, target_node_id, max_depth)

        if not rows:
            return f"<blast_radius target='{target_file}' max_depth='{max_depth}'><info>No dependencies found.</info></blast_radius>"

        # Group by depth and impact type
        # dict: depth -> {"direct_impact": set(), "api_impact": set()}
        layers: dict[int, dict[str, set[str]]] = {}

        for row in rows:
            depth = row["depth"]
            edge_type = row["edge_type"]
            # Enums might be returned as strings or Enum objects depending on SQLAlchemy driver mapping
            if isinstance(edge_type, EdgeType):
                edge_type_name = edge_type.name
            else:
                edge_type_name = str(edge_type).replace("EdgeType.", "")

            source_file = row["source_file_path"] or row["source_id"]

            if depth not in layers:
                layers[depth] = {"direct_impact": set(), "api_impact": set()}

            impact_str = f"- {source_file} (Type: {edge_type_name})"

            if edge_type_name == "API_CALL":
                layers[depth]["api_impact"].add(impact_str)
            else:
                layers[depth]["direct_impact"].add(impact_str)

        # Build XML
        xml_lines = [f'<blast_radius target="{target_file}" max_depth="{max_depth}">']

        for depth in sorted(layers.keys()):
            xml_lines.append(f'  <impact_layer depth="{depth}">')
            layer = layers[depth]

            if layer["direct_impact"]:
                xml_lines.append('    <direct_impact>')
                for impact in sorted(layer["direct_impact"]):
                    xml_lines.append(f'      {impact}')
                xml_lines.append('    </direct_impact>')

            if layer["api_impact"]:
                xml_lines.append('    <api_impact>')
                for impact in sorted(layer["api_impact"]):
                    xml_lines.append(f'      {impact}')
                xml_lines.append('    </api_impact>')

            xml_lines.append('  </impact_layer>')

        xml_lines.append('</blast_radius>')

        return "\n".join(xml_lines)
