import os
import asyncio
from pathlib import Path
from typing import List, Optional

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

class VectorEngine:
    _instance: Optional["VectorEngine"] = None
    
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir
        self.model_path = model_dir / "model.onnx"
        self.tokenizer_path = model_dir / "tokenizer.json"
        
        if not self.model_path.exists() or not self.tokenizer_path.exists():
            raise RuntimeError(f"Model files not found in {model_dir}. Offline-First strict mode requires model.onnx and tokenizer.json to be bundled.")
            
        # Regla del Sensei #3: Prevención de Canibalismo de Hilos (Thrashing)
        # Capamos ONNX para que no intente usar todos los núcleos del servidor en una sola petición.
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        opts.inter_op_num_threads = 1
        
        # Regla del Sensei #1: Lifespan Singleton
        # Cargamos el modelo una sola vez y lo mantenemos en RAM.
        self.session = ort.InferenceSession(
            str(self.model_path), 
            sess_options=opts, 
            providers=["CPUExecutionProvider"]
        )
        
        # Cargar Tokenizer
        self.tokenizer = Tokenizer.from_file(str(self.tokenizer_path))
        self.tokenizer.enable_padding(pad_id=0, pad_token="[PAD]", length=512)
        self.tokenizer.enable_truncation(max_length=512)

    @classmethod
    def initialize(cls, model_dir: Path) -> "VectorEngine":
        if cls._instance is None:
            cls._instance = cls(model_dir)
        return cls._instance
        
    @classmethod
    def get_instance(cls) -> "VectorEngine":
        if cls._instance is None:
            raise RuntimeError("VectorEngine no inicializado. Llama a initialize() en el lifespan de FastAPI.")
        return cls._instance

    def _generate_embedding_sync(self, text: str) -> List[float]:
        """Ejecuta la inferencia ONNX en CPU de forma síncrona."""
        encoded = self.tokenizer.encode(text)
        
        # ONNX necesita numpy arrays de int64
        input_ids = np.array([encoded.ids], dtype=np.int64)
        attention_mask = np.array([encoded.attention_mask], dtype=np.int64)
        token_type_ids = np.array([encoded.type_ids], dtype=np.int64)
        
        inputs = {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "token_type_ids": token_type_ids
        }
        
        # Ejecutar modelo
        outputs = self.session.run(None, inputs)
        
        # Mean Pooling usando la máscara de atención
        token_embeddings = outputs[0][0] # (seq_len, hidden_size)
        mask = attention_mask[0] # (seq_len,)
        
        # Filtramos los embeddings que no son de padding
        valid_embeddings = token_embeddings[mask == 1]
        
        # Si no hay tokens válidos (caso extremo), devolvemos vector de ceros
        if len(valid_embeddings) == 0:
            return [0.0] * 384
            
        # Promedio sobre la longitud de la secuencia (Mean Pooling)
        mean_pooled = np.mean(valid_embeddings, axis=0)
        
        # L2 Normalization (Crucial para cosine similarity)
        norm = np.linalg.norm(mean_pooled)
        if norm > 0:
            mean_pooled = mean_pooled / norm
            
        return mean_pooled.tolist()

    async def generate_embedding(self, text: str) -> List[float]:
        """
        Regla del Sensei #2: Offload a un ThreadPool (El Cocinero Musculoso).
        Delega el cómputo pesado sin bloquear el Event Loop de FastAPI.
        """
        return await asyncio.to_thread(self._generate_embedding_sync, text)
