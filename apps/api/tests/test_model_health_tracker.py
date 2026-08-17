import pytest
from httpx import ASGITransport, AsyncClient

from app.infrastructure.ai.model_health_tracker import ModelHealthTracker
from app.infrastructure.db.database import get_engine
from app.infrastructure.db.models import Base
from app.main import app


def test_calculate_status():
    assert ModelHealthTracker.calculate_status(0, 0, 0, 0.0) == "untested"
    # 95% success, fast latency -> healthy
    assert ModelHealthTracker.calculate_status(100, 95, 0, 1200.0) == "healthy"
    # 80% success -> degraded
    assert ModelHealthTracker.calculate_status(10, 8, 1, 3000.0) == "degraded"
    # High latency -> degraded
    assert ModelHealthTracker.calculate_status(10, 10, 0, 18000.0) == "degraded"
    # High timeouts -> failing
    assert ModelHealthTracker.calculate_status(10, 4, 6, 25000.0) == "failing"
    # Low success rate -> failing
    assert ModelHealthTracker.calculate_status(10, 5, 2, 5000.0) == "failing"


@pytest.mark.asyncio
async def test_record_call_and_api_endpoints():
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    model_name = "test-provider/test-model-health"
    await ModelHealthTracker.record_call(
        model_id=model_name,
        provider="test-provider",
        latency_ms=1500,
        success=True,
    )
    await ModelHealthTracker.record_call(
        model_id=model_name,
        provider="test-provider",
        latency_ms=25000,
        success=False,
        error="SocketTimeoutError",
        is_timeout=True,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/settings/model-health")
        assert response.status_code == 200
        metrics = response.json()
        target = next((m for m in metrics if m["model_id"] == model_name), None)
        assert target is not None
        assert target["total_calls"] == 2
        assert target["success_calls"] == 1
        assert target["failed_calls"] == 1
        assert target["timeout_calls"] == 1
        assert target["success_rate"] == 50.0

        # Delete / Reset
        del_resp = await client.delete(f"/api/v1/settings/model-health/{model_name}")
        assert del_resp.status_code == 200
        assert del_resp.json()["status"] == "deleted"
