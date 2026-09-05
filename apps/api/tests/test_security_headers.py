"""Regression test for the minimal security headers middleware (item #13).

Matters most in `--web` fallback mode (start_dev.sh), where this server
serves the frontend directly to a plain browser with none of Tauri's own
CSP (tauri.conf.json) in effect - that CSP only applies inside the
Tauri-managed webview.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_security_headers_present_on_every_response():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/health")

    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert res.headers["Referrer-Policy"] == "no-referrer"
    csp = res.headers["Content-Security-Policy"]
    assert "default-src 'self'" in csp
    assert "style-src 'self' 'unsafe-inline'" in csp
