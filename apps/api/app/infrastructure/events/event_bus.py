import asyncio
import time
from collections.abc import AsyncGenerator


class EventBus:
    """
    Event Bus en memoria simple usando asyncio.Queue.
    ADVERTENCIA ARQUITECTÓNICA: Esta implementación asume un entorno de Single Worker
    (por ejemplo, desktop-first local dev). Si se despliega con múltiples workers ASGI,
    las suscripciones quedarán huérfanas en diferentes procesos. Se requiere Redis Pub/Sub para Cloud.
    """
    def __init__(self):
        # Diccionario de colas: un topic -> lista de colas (una por suscriptor)
        self._subscribers: dict[str, list[asyncio.Queue[dict]]] = {}
        # Estado para el throttling: topic -> timestamp del último envío
        self._last_emitted: dict[str, float] = {}

    def subscribe(self, topic: str) -> asyncio.Queue[dict]:
        if topic not in self._subscribers:
            self._subscribers[topic] = []
        queue: asyncio.Queue[dict] = asyncio.Queue()
        self._subscribers[topic].append(queue)
        return queue

    def unsubscribe(self, topic: str, queue: asyncio.Queue[dict]):
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
                data = await queue.get()
                yield data
                queue.task_done()
                if data.get("type") == "completed":
                    break
        finally:
            self.unsubscribe(topic, queue)

    async def persistent_event_generator(self, topic: str) -> AsyncGenerator[dict, None]:
        """Generador asíncrono para conexiones SSE de larga duración.
        No se detiene con eventos 'completed' — solo termina cuando el cliente
        se desconecta (CancelledError)."""
        queue = self.subscribe(topic)
        try:
            while True:
                data = await queue.get()
                yield data
                queue.task_done()
        finally:
            self.unsubscribe(topic, queue)

    def subscriber_count(self, topic: str) -> int:
        """Número de suscriptores activos en un topic."""
        return len(self._subscribers.get(topic, []))

global_event_bus = EventBus()
