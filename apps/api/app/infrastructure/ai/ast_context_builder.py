import uuid
import xml.etree.ElementTree as ET
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.models import ASTNodeMapModel, ASTVectorModel


@dataclass
class ContextNode:
    fqn: str
    content: str
    node_type: str
    start_line: int
    parent_fqn: str


class ASTContextBuilder:
    def __init__(self, session: AsyncSession, project_id: str):
        self.session = session
        self.project_id = uuid.UUID(project_id)

    async def _fetch_file_nodes(self, file_path: str) -> list[ContextNode]:
        """Fetch all vector contents for a file to build the semantic ecosystem."""
        stmt = (
            select(ASTNodeMapModel, ASTVectorModel)
            .join(ASTVectorModel, ASTNodeMapModel.node_hash == ASTVectorModel.node_hash)
            .where(
                ASTNodeMapModel.project_id == self.project_id,
                ASTNodeMapModel.file_path == file_path
            )
        )
        results = (await self.session.execute(stmt)).all()

        nodes = []
        for map_model, vec_model in results:
            # We must parse node_type and parent_fqn from the FQN (or we should have stored it)
            # FQN format: path::[class]Name::[def]method
            parts = map_model.fqn.split("::")
            node_type = "unknown"
            if len(parts) > 1:
                if "[class]" in parts[-1]:
                    node_type = "class"
                elif "[def]" in parts[-1]:
                    node_type = "def"
                elif "[import]" in parts[-1]:
                    node_type = "import"
                elif "[var]" in parts[-1]:
                    node_type = "var"

            parent_fqn = "::".join(parts[:-1]) if len(parts) > 1 else ""

            # Start line extraction (a hack if we didn't store it, ideally we'd store it in ASTNodeMapModel)
            # For this MVP, we just use 0 to group them hierarchically first.
            # A real implementation would store start_line in ASTNodeMapModel to sort properly.

            nodes.append(ContextNode(
                fqn=map_model.fqn,
                content=vec_model.content,
                node_type=node_type,
                start_line=0,  # We would fetch this from DB
                parent_fqn=parent_fqn
            ))
        return nodes

    def _truncate_global_variable(self, content: str) -> str:
        """Global Variable Guillotine: Truncate massive static dictionaries."""
        lines = content.split('\n')
        if len(lines) <= 2:
            return content
        return f"{lines[0]} ... # (Truncated by SprintLogic Context Pruner)"

    def build_xml_context(self, target_fqn: str, file_path: str, all_nodes: list[ContextNode]) -> str:
        """
        Builds the XML using the Topological and Hierarchical Pruning Algorithm.
        """
        target = next((n for n in all_nodes if n.fqn == target_fqn), None)
        if not target:
            return ""

        # Ecosistema: Imports + Constants
        ecosystem_nodes = [n for n in all_nodes if n.node_type in ('import', 'var') and n.parent_fqn == file_path]

        ecosystem_content = []
        for node in ecosystem_nodes:
            if node.node_type == 'var':
                ecosystem_content.append(self._truncate_global_variable(node.content))
            else:
                ecosystem_content.append(node.content)

        # Firmas Hermanas: Topological Pruning
        # 1. Filtro A: Familia Directa (Mismo parent)
        candidates = [n for n in all_nodes if n.parent_fqn == target.parent_fqn and n.fqn != target.fqn and n.node_type in ('def', 'class')]

        # 2. Filtro B: Localidad Espacial
        # Asumiendo que start_line está disponible (sort by distance)
        candidates.sort(key=lambda x: abs(target.start_line - x.start_line))

        # 3. La Guillotina: Top 15
        top_15 = candidates[:15]

        # 4. Re-ensamblado cronológico
        top_15.sort(key=lambda x: x.start_line)

        # Build XML
        root = ET.Element("contexto_ast")

        ecosystem = ET.SubElement(root, "ecosistema")
        ecosystem.text = "\n".join(ecosystem_content)

        firmas = ET.SubElement(root, "firmas_hermanas")
        firmas_text = []
        for n in top_15:
            # Extraer solo la firma (las primeras líneas)
            lines = n.content.split('\n')
            signature = "\n".join([line for line in lines if not line.strip().startswith("#") and "def " in line or "class " in line])
            firmas_text.append(signature + " ...")
        firmas.text = "\n".join(firmas_text)

        codigo = ET.SubElement(root, "codigo_objetivo", fqn=target.fqn)
        codigo.text = target.content

        return ET.tostring(root, encoding="unicode")
