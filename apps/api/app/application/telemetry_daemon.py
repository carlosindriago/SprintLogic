import asyncio
import logging
from datetime import datetime, timezone

import litellm
from sqlalchemy import text

from app.infrastructure.db.database import AsyncSessionLocal
from app.infrastructure.events.event_bus import EventBus
from app.infrastructure.security.credential_manager import CredentialManager

logger = logging.getLogger("sprintlogic.daemon")

FRICTION_THRESHOLD = 5
DEEP_FLOW_MIN_SECONDS = 15 * 60
MONITOR_WINDOW_MINUTES = 30
CYCLE_INTERVAL_SECONDS = 300
INITIAL_DELAY_SECONDS = 60
COOLDOWN_SECONDS = 30 * 60


class TelemetryDaemon:
    def __init__(self, event_bus: EventBus):
        self._event_bus = event_bus
        self._tasks: dict[str, asyncio.Task[None]] = {}

    async def start_monitoring(self, project_id: str) -> None:
        if project_id in self._tasks:
            return
        logger.info("Daemon started for project %s", project_id)
        self._tasks[project_id] = asyncio.create_task(
            self._monitor_loop(project_id),
            name=f"telemetry-daemon-{project_id}",
        )

    async def stop_monitoring(self, project_id: str) -> None:
        task = self._tasks.pop(project_id, None)
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            logger.info("Daemon stopped for project %s", project_id)

    @property
    def active_projects(self) -> list[str]:
        return list(self._tasks.keys())

    async def _monitor_loop(self, project_id: str) -> None:
        await asyncio.sleep(INITIAL_DELAY_SECONDS)
        while True:
            try:
                await self._check_vitals(project_id)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("TelemetryDaemon cycle failed for %s", project_id)
            await asyncio.sleep(CYCLE_INTERVAL_SECONDS)

    async def _check_vitals(self, project_id: str) -> None:
        anomaly = await self._detect_anomaly(project_id)
        if not anomaly:
            return

        if self._event_bus.subscriber_count(f"session:{project_id}") == 0:
            logger.debug("No SSE subscribers for %s, skipping notification", project_id)
            return

        if not await self._try_acquire_lock(project_id, anomaly["rule"]):
            logger.debug("Cooldown active for rule %s on project %s", anomaly["rule"], project_id)
            return

        message = await self._generate_insight(project_id, anomaly)
        if not message:
            return

        await self._event_bus.publish(
            f"session:{project_id}",
            {
                "type": "daemon_insight",
                "project_id": project_id,
                "anomaly": anomaly,
                "message": message,
                "timestamp": datetime.now(timezone.utc).isoformat(),  # noqa: UP017
            },
        )
        logger.info("Daemon insight published for %s: %s", project_id, anomaly["rule"])

    async def _try_acquire_lock(self, project_id: str, rule: str) -> bool:
        """Leader election + cooldown via SQLite daemon_locks.

        Solo un worker (el que gana la escritura atómica) dispara la
        notificación. Si el último disparo fue hace menos de COOLDOWN_SECONDS,
        ningún worker puede adquirir el lock.
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT last_fired_at FROM daemon_locks
                    WHERE project_id = :pid AND rule = :rule
                """),
                {"pid": project_id, "rule": rule},
            )
            row = result.fetchone()

            if row and row[0]:
                check = await session.execute(
                    text(
                        "SELECT datetime(:last) < datetime('now', :cooldown)"
                    ),
                    {
                        "last": row[0],
                        "cooldown": f"-{COOLDOWN_SECONDS} seconds",
                    },
                )
                expired = check.scalar()
                if not expired:
                    return False

            await session.execute(
                text("""
                    INSERT INTO daemon_locks (project_id, rule, last_fired_at)
                    VALUES (:pid, :rule, datetime('now'))
                    ON CONFLICT(project_id, rule) DO UPDATE
                    SET last_fired_at = excluded.last_fired_at
                """),
                {"pid": project_id, "rule": rule},
            )
            await session.commit()
            return True

    async def _detect_anomaly(self, project_id: str) -> dict | None:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT
                        COALESCE(SUM(thinking_ms + coding_ms + testing_ms), 0) as total_activity_ms,
                        COUNT(*) as ping_count,
                        COUNT(CASE WHEN thinking_ms + coding_ms + testing_ms = 0 THEN 1 END) as idle_pings
                    FROM telemetry_pings
                    WHERE timestamp >= datetime('now', :window)
                """),
                {"window": f"-{MONITOR_WINDOW_MINUTES} minutes"},
            )
            row = result.fetchone()
            if not row:
                return None

            total_ms = row[0] or 0
            ping_count = row[1] or 0
            idle_pings = row[2] or 0

        if ping_count == 0:
            return None

        total_seconds = total_ms / 1000.0
        idle_ratio = idle_pings / ping_count if ping_count > 0 else 0

        if total_seconds < DEEP_FLOW_MIN_SECONDS and idle_pings >= FRICTION_THRESHOLD:
            return {
                "rule": "high_friction_low_flow",
                "total_activity_seconds": round(total_seconds, 1),
                "idle_pings": idle_pings,
                "idle_ratio": round(idle_ratio * 100, 1),
                "window_minutes": MONITOR_WINDOW_MINUTES,
            }

        if idle_ratio > 0.6 and ping_count >= 3:
            return {
                "rule": "distraction_warning",
                "total_activity_seconds": round(total_seconds, 1),
                "idle_pings": idle_pings,
                "idle_ratio": round(idle_ratio * 100, 1),
                "window_minutes": MONITOR_WINDOW_MINUTES,
            }

        return None

    async def _generate_insight(self, project_id: str, anomaly: dict) -> str | None:
        try:
            api_key = CredentialManager.get_api_key("gemini")
            if not api_key:
                logger.warning("No Gemini API key configured, using fallback message")
                return self._fallback_message(anomaly)

            rule = anomaly["rule"]
            if rule == "high_friction_low_flow":
                prompt = (
                    "Eres SprintLogic Sensei, un mentor de productividad para desarrolladores. "
                    "El desarrollador muestra signos de atasco:\n"
                    f"- Actividad real en los últimos {anomaly['window_minutes']} min: {anomaly['total_activity_seconds']} segundos\n"
                    f"- Pings inactivos: {anomaly['idle_pings']} ({anomaly['idle_ratio']}% del total)\n\n"
                    "Escribe UN mensaje corto (máximo 2 oraciones) en español, empático pero directo, "
                    "sugiriendo un descanso de 5 minutos, un cambio de enfoque, o preguntar al chat de IA "
                    "qué archivo está causando fricción. NO uses Markdown. Sé breve."
                )
            else:
                prompt = (
                    "Eres SprintLogic Sensei, un mentor de productividad para desarrolladores. "
                    "El desarrollador muestra signos de distracción:\n"
                    f"- Actividad real en los últimos {anomaly['window_minutes']} min: {anomaly['total_activity_seconds']} segundos\n"
                    f"- Ratio de inactividad: {anomaly['idle_ratio']}%\n\n"
                    "Escribe UN mensaje corto (máximo 2 oraciones) en español, empático pero directo, "
                    "sugiriendo retomar el foco o preguntar al chat qué sigue en el plan. "
                    "NO uses Markdown. Sé breve."
                )

            response = await litellm.acompletion(
                model="gemini/gemini-2.5-flash",
                messages=[{"role": "user", "content": prompt}],
                api_key=api_key,
                max_tokens=120,
            )
            text = response.choices[0].message.content
            return text.strip() if text else None

        except Exception:
            logger.exception("LLM insight generation failed")
            return self._fallback_message(anomaly)

    @staticmethod
    def _fallback_message(anomaly: dict) -> str:
        rule = anomaly["rule"]
        if rule == "high_friction_low_flow":
            return (
                f"Llevás {anomaly['window_minutes']} min con alta fricción y baja concentración. "
                "¿Probamos un descanso de 5 minutos o revisamos en qué archivo estás atascado?"
            )
        return (
            f"Tu ratio de inactividad es del {anomaly['idle_ratio']}% en los últimos "
            f"{anomaly['window_minutes']} minutos. ¿Retomamos el foco?"
        )
