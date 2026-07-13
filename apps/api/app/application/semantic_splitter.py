
import tree_sitter


class SemanticMarkdownSplitter:
    """
    Agrupador Semántico (Semantic Splitter) para RAG.
    Usa el AST de Tree-sitter para particionar Markdown manteniendo la jerarquía y el contexto.
    """
    def __init__(self, max_chunk_size: int = 1500, chunk_overlap: int = 200, hierarchy_template: str = "[Documento: {doc}] [Sección: {breadcrumbs}]\n\n"):
        self.max_chunk_size = max_chunk_size
        self.chunk_overlap = chunk_overlap
        self.hierarchy_template = hierarchy_template

        try:
            import tree_sitter_markdown as tsm
            self.parser = tree_sitter.Parser()
            self.parser.language = tree_sitter.Language(tsm.language())
        except Exception as e:
            # Fallback for older tree-sitter-markdown versions if needed
            print(f"Warning: could not load tree_sitter_markdown: {e}")
            self.parser = None

    def split(self, content: bytes, file_name: str) -> list[str]:
        if not self.parser:
            return [self._apply_seal(content.decode('utf-8', errors='ignore')[:self.max_chunk_size], file_name, [])]

        tree = self.parser.parse(content)
        chunks = []

        if not tree.root_node.children:
            return []

        current_breadcrumbs = []
        current_chunk_text = ""

        for node in tree.root_node.children:
            node_type = node.type

            # Tree-sitter markdown usa 'atx_heading'
            if node_type == "atx_heading":
                heading_text = content[node.start_byte:node.end_byte].decode("utf-8")
                # Extraer nivel de encabezado contando los '#'
                level = len(heading_text) - len(heading_text.lstrip('#'))
                title = heading_text.lstrip('#').strip()

                # Actualizar la Pila de Contexto (Breadcrumbs)
                current_breadcrumbs = current_breadcrumbs[:level-1]
                current_breadcrumbs.append(title)

                node_text = heading_text
            else:
                node_text = content[node.start_byte:node.end_byte].decode("utf-8")

            # Verificar si añadir este nodo supera el límite
            if len(current_chunk_text) + len(node_text) > self.max_chunk_size:
                # ¿Es el nodo individual más grande que el límite? (El Bloque Godzilla)
                if len(node_text) > self.max_chunk_size:
                    # Cerrar el chunk actual primero si tiene contenido
                    if current_chunk_text.strip():
                        chunks.append(self._apply_seal(current_chunk_text, file_name, current_breadcrumbs))
                        current_chunk_text = ""

                    # Aplicar la válvula de escape Godzilla
                    godzilla_chunks = self._split_godzilla_node(node, content, file_name, current_breadcrumbs)
                    chunks.extend(godzilla_chunks)
                else:
                    # Cerrar el chunk actual y crear uno nuevo con Overlap
                    if current_chunk_text.strip():
                        chunks.append(self._apply_seal(current_chunk_text, file_name, current_breadcrumbs))

                    # Extraer el Overlap (Solapamiento) del final del texto anterior
                    overlap_text = current_chunk_text[-self.chunk_overlap:] if self.chunk_overlap > 0 else ""
                    # Opcionalmente se puede truncar en el salto de línea anterior para no partir palabras
                    if overlap_text and "\n" in overlap_text:
                        overlap_text = overlap_text[overlap_text.find("\n")+1:]

                    current_chunk_text = (overlap_text + "\n" + node_text) if overlap_text else node_text
            else:
                current_chunk_text += ("\n" + node_text) if current_chunk_text else node_text

        # Guardar el último chunk restante
        if current_chunk_text.strip():
            chunks.append(self._apply_seal(current_chunk_text, file_name, current_breadcrumbs))

        return chunks

    def _apply_seal(self, chunk_text: str, file_name: str, breadcrumbs: list[str]) -> str:
        """Sello de Memoria: Inyecta el contexto jerárquico al inicio del Chunk."""
        bc_str = " > ".join(breadcrumbs) if breadcrumbs else "General"
        seal = self.hierarchy_template.format(doc=file_name, breadcrumbs=bc_str)
        return seal + chunk_text.strip()

    def _split_godzilla_node(self, node, content: bytes, file_name: str, breadcrumbs: list[str]) -> list[str]:
        """
        Válvula de Escape para nodos masivos.
        Si es código, usa Comentarios Sintéticos de Continuidad.
        """
        node_text = content[node.start_byte:node.end_byte].decode("utf-8")
        is_code = node.type == "fenced_code_block"
        chunks = []

        lines = node_text.splitlines()
        current_chunk = ""

        for line in lines:
            if len(current_chunk) + len(line) > self.max_chunk_size and current_chunk:
                # Comentario sintético (El Problema de los 4 Huevos resuelto)
                if is_code:
                    current_chunk += "\n# --- [Chunk truncado por longitud. Continúa en el siguiente fragmento] ---"

                chunks.append(self._apply_seal(current_chunk, file_name, breadcrumbs))

                if is_code:
                    current_chunk = "# --- [Continuación del bloque anterior] ---\n" + line
                else:
                    # Para texto plano, un overlap simple
                    current_chunk = line
            else:
                current_chunk += ("\n" + line) if current_chunk else line

        if current_chunk.strip():
            chunks.append(self._apply_seal(current_chunk, file_name, breadcrumbs))

        return chunks
