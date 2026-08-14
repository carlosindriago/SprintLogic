"""Model Health & Reliability Tracker.

Tracks latency, success rate, timeouts, and health status for LLM models across SprintLogic.
Runs asynchronously and non-blockingly so telemetry never slows down AI operations.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_sessionmaker
from app.infrastructure.db.models import ModelHealthMetricModel

logger = logging.getLogger(__name__)


class ModelHealthTracker:
    """Manages recording and querying LLM model health metrics in SQLite."""

    @staticmethod
    def calculate_status(
        total_calls: int, success_calls: int, timeout_calls: int, avg_latency_ms: float
    ) -> str:
        """Determines health status based on call statistics."""
        if total_calls == 0:
            return "untested"

        success_rate = (success_calls / total_calls) * 100.0

        # If timeouts exceed 50% or success rate is below 60%, mark failing
        if success_rate < 60.0 or (timeout_calls / total_calls) > 0.5:
            return "failing"

        # If success rate is acceptable but latency is very high or some errors occurred
        if success_rate < 90.0 or avg_latency_ms > 15000:
            return "degraded"

        return "healthy"

    @classmethod
    async def record_call(
        cls,
        model_id: str,
        provider: str,
        latency_ms: int,
        success: bool,
        error: str | None = None,
        is_timeout: bool = False,
    ) -> None:
        """Persists a single LLM execution metric to SQLite."""
        try:
            async with get_sessionmaker()() as session:
                result = await session.execute(
                    select(ModelHealthMetricModel).where(
                        ModelHealthMetricModel.model_id == model_id
                    )
                )
                metric = result.scalars().first()

                now = datetime.now(UTC)
                if metric is None:
                    metric = ModelHealthMetricModel(
                        id=str(uuid.uuid4()),
                        model_id=model_id,
                        provider=provider,
                        total_calls=1,
                        success_calls=1 if success else 0,
                        failed_calls=0 if success else 1,
                        timeout_calls=1 if is_timeout else 0,
                        total_latency_ms=latency_ms,
                        avg_latency_ms=float(latency_ms),
                        last_latency_ms=latency_ms,
                        last_error=error,
                        last_status=cls.calculate_status(
                            1,
                            1 if success else 0,
                            1 if is_timeout else 0,
                            float(latency_ms),
                        ),
                        last_called_at=now,
                    )
                    session.add(metric)
                else:
                    metric.total_calls += 1
                    if success:
                        metric.success_calls += 1
                    else:
                        metric.failed_calls += 1
                    if is_timeout:
                        metric.timeout_calls += 1

                    metric.total_latency_ms += latency_ms
                    metric.avg_latency_ms = round(
                        metric.total_latency_ms / metric.total_calls, 1
                    )
                    metric.last_latency_ms = latency_ms
                    if error:
                        metric.last_error = error
                    metric.last_called_at = now
                    metric.last_status = cls.calculate_status(
                        metric.total_calls,
                        metric.success_calls,
                        metric.timeout_calls,
                        metric.avg_latency_ms,
                    )

                await session.commit()
        except Exception as e:
            # Model telemetry is non-critical — never crash the caller
            logger.debug("Failed to record model health metric: %s", e)

    @classmethod
    def record_call_background(
        cls,
        model_id: str,
        provider: str,
        latency_ms: int,
        success: bool,
        error: str | None = None,
        is_timeout: bool = False,
    ) -> None:
        """Schedules non-blocking async record_call."""
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(
                cls.record_call(
                    model_id=model_id,
                    provider=provider,
                    latency_ms=latency_ms,
                    success=success,
                    error=error,
                    is_timeout=is_timeout,
                )
            )
        except RuntimeError:
            pass

    @classmethod
    async def get_all_metrics(cls, session: AsyncSession) -> list[dict[str, Any]]:
        """Retrieves all model health metrics formatted for API responses."""
        result = await session.execute(
            select(ModelHealthMetricModel).order_by(ModelHealthMetricModel.last_called_at.desc())
        )
        records = result.scalars().all()
        data = []
        for r in records:
            success_rate = (
                round((r.success_calls / r.total_calls) * 100.0, 1) if r.total_calls > 0 else 0.0
            )
            data.append(
                {
                    "model_id": r.model_id,
                    "provider": r.provider,
                    "total_calls": r.total_calls,
                    "success_calls": r.success_calls,
                    "failed_calls": r.failed_calls,
                    "timeout_calls": r.timeout_calls,
                    "success_rate": success_rate,
                    "avg_latency_ms": r.avg_latency_ms,
                    "last_latency_ms": r.last_latency_ms,
                    "last_error": r.last_error,
                    "status": r.last_status,
                    "last_called_at": r.last_called_at.isoformat() if r.last_called_at else None,
                }
            )
        return data

    @classmethod
    async def delete_metric(cls, session: AsyncSession, model_id: str) -> bool:
        """Resets/deletes metrics for a specific model."""
        result = await session.execute(
            select(ModelHealthMetricModel).where(ModelHealthMetricModel.model_id == model_id)
        )
        record = result.scalars().first()
        if record:
            await session.delete(record)
            await session.commit()
            return True
        return False
