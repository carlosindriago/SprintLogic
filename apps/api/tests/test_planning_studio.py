import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_remove_tool_model_mapping_is_idempotent():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Deleting a non-existent override should return 200 with status deleted
        response = await client.delete("/api/v1/settings/tool-models/planning_studio")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "deleted"
        assert data["tool_name"] == "planning_studio"


@pytest.mark.asyncio
async def test_planning_studio_message_endpoint_validation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Invalid payload without required fields
        response = await client.post("/api/v1/planning-studio/message", json={})
        assert response.status_code == 422
