import asyncio
from typing import Dict

# Registro global de tokens de cancelación para los escaneos en curso.
# Llave: project_id (str), Valor: asyncio.Event
active_scans: Dict[str, asyncio.Event] = {}
