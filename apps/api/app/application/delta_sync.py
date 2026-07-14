import hashlib

import numpy as np  # type: ignore
from sqlalchemy import text

from app.application.semantic_splitter import SemanticMarkdownSplitter
from app.infrastructure.ai.vector_engine import VectorEngine
from app.infrastructure.db.database import AsyncSessionLocal


class DeltaSyncOrchestrator:
    def __init__(self):
        self.splitter = SemanticMarkdownSplitter()

    async def ingest_file(self, filepath: str, content: bytes) -> bool:
        """
        Orquesta la ingesta de un archivo (como un ADR):
        1. Compara hash para evitar re-vectorizar si no hay cambios.
        2. Trocea el contenido con SemanticMarkdownSplitter.
        3. Genera vectores con VectorEngine (sin bloquear el Event Loop).
        4. Persiste de forma atómica en SQLite y sqlite-vec eliminando versiones previas.

        Devuelve True si procesó el archivo, False si lo saltó por hash idéntico.
        """
        file_hash = hashlib.sha256(content).hexdigest()

        # 1. Comprobación temprana (Early Exit) si el archivo no ha cambiado
        async with AsyncSessionLocal() as session:
            conn = await session.connection()
            result = await session.execute(
                text("SELECT id FROM adr_chunks WHERE filepath = :filepath AND file_hash = :file_hash LIMIT 1"),
                {"filepath": filepath, "file_hash": file_hash}
            )
            if result.scalar() is not None:
                # El archivo no ha cambiado, nos ahorramos el RAG
                return False

        # 2. Partición Semántica (El Bisturí)
        chunks = self.splitter.split(content, file_name=filepath.split('/')[-1])
        engine = VectorEngine.get_instance()

        chunks_with_embeddings = []
        for chunk_text in chunks:
            # 3. Generación Asíncrona (Offloaded) del vector
            embedding = await engine.generate_embedding(chunk_text)

            # sqlite-vec acepta tensores en crudo como bytes de Float32
            emb_bytes = np.array(embedding, dtype=np.float32).tobytes()
            chunks_with_embeddings.append((chunk_text, emb_bytes))

        # 4. Transacción Atómica "Los Dos Mundos"
        async with AsyncSessionLocal() as session:
            conn = await session.connection()
            async with session.begin():
                # A. Identificar IDs antiguos (rowid) para borrarlos de la tabla virtual
                result = await session.execute(
                    text("SELECT id FROM adr_chunks WHERE filepath = :filepath"),
                    {"filepath": filepath}
                )
                old_ids = [row[0] for row in result.fetchall()]

                if old_ids:
                    # Borrar de la tabla virtual (catálogo mágico) usando IN
                    ids_str = ",".join(map(str, old_ids))
                    await session.execute(
                        text(f"DELETE FROM adr_vectors WHERE rowid IN ({ids_str})")
                    )
                    # Borrar de la tabla de metadatos (estantería normal)
                    await session.execute(
                        text("DELETE FROM adr_chunks WHERE filepath = :filepath"),
                        {"filepath": filepath}
                    )

                # B. Inserción Sincronizada del nuevo estado
                for chunk_text, emb_bytes in chunks_with_embeddings:
                    # Inserción en Estantería Normal con RETURNING id (Micro-Reglazo)
                    res = await session.execute(
                        text("INSERT INTO adr_chunks (filepath, file_hash, chunk_text) VALUES (:filepath, :file_hash, :chunk_text) RETURNING id"),
                        {"filepath": filepath, "file_hash": file_hash, "chunk_text": chunk_text}
                    )
                    row_id = res.scalar()

                    # Inserción en Catálogo Mágico enlazado por el rowid
                    await session.execute(
                        text("INSERT INTO adr_vectors (rowid, embedding) VALUES (:rowid, :embedding)"),
                        {"rowid": row_id, "embedding": emb_bytes}
                    )

        return True
