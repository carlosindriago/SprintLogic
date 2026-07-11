import asyncio

# Registro global de tokens de cancelación para los escaneos en curso.
# Llave: project_id (str), Valor: asyncio.Event
active_scans: dict[str, asyncio.Event] = {}
