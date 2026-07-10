import asyncio
import time
from typing import Dict, AsyncGenerator

class EventBus:
    """
    Event Bus en memoria simple usando asyncio.Queue.
    ADVERTENCIA ARQUITECTÓNICA: Esta implementación asume un entorno de Single Worker
    (por ejemplo, desktop-first local dev). Si se despliega con múltiples workers ASGI,
    las suscripciones quedarán huérfanas en diferentes procesos. Se requiere Redis Pub/Sub para Cloud.
    """
    def __init__(self):
        # Diccionario de colas: un topic -> lista de colas (una por suscriptor)
        self._subscribers: Dict[str, list[asyncio.Queue]] = {}
        # Estado para el throttling: topic -> timestamp del último envío
        self._last_emitted: Dict[str, float] = {}

    def subscribe(self, topic: str) -> asyncio.Queue:
        if topic not in self._subscribers:
            self._subscribers[topic] = []
        queue = asyncio.Queue()
        self._subscribers[topic].append(queue)
        return queue

    def unsubscribe(self, topic: str, queue: asyncio.Queue):
        if topic in self._subscribers and queue in self._subscribers[topic]:
            self._subscribers[topic].remove(queue)

    async def publish(self, topic: str, data: dict):
        if topic in self._subscribers:
            for queue in self._subscribers[topic]:
                await queue.put(data)

    async def publish_throttled(self, topic: str, data: dict, throttle_ms: int = 100):
        """
        Publica el evento solo si han pasado 'throttle_ms' desde la última vez,
        o si explícitamente es el evento de finalización (progreso 100%).
        """
        now = time.time()
        last = self._last_emitted.get(topic, 0)
        
        is_completed = data.get("type") == "completed" or data.get("progress") == 100
        
        if is_completed or (now - last) >= (throttle_ms / 1000.0):
            self._last_emitted[topic] = now
            await self.publish(topic, data)

    async def event_generator(self, topic: str) -> AsyncGenerator[dict, None]:
        """Generador asíncrono que consume eventos de una cola para Server-Sent Events."""
        queue = self.subscribe(topic)
        try:
            while True:
                # Esperamos nuevos eventos en la cola de este suscriptor
                data = await queue.get()
                yield data
                queue.task_done()
                if data.get("type") == "completed":
                    break
        finally:
            self.unsubscribe(topic, queue)
