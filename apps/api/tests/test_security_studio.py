import pytest

from app.infrastructure.security.sast_runner import (
    GitleaksRunner,
    SecurityEngine,
    SecurityFinding,
    SemgrepRunner,
)
from app.interfaces.api.v1.security_studio import _clean_json_response


@pytest.mark.asyncio
async def test_semgrep_runner(tmp_path):
    runner = SemgrepRunner(str(tmp_path))
    findings = await runner.scan()
    assert len(findings) > 0
    assert all(isinstance(f, SecurityFinding) for f in findings)
    assert any(f.severity == "critical" for f in findings)


@pytest.mark.asyncio
async def test_gitleaks_runner(tmp_path):
    runner = GitleaksRunner(str(tmp_path))
    findings = await runner.scan()
    assert len(findings) > 0
    assert findings[0].tool == "gitleaks"
    assert "CWE-798" in (findings[0].cwe or "")


@pytest.mark.asyncio
async def test_security_engine(tmp_path):
    engine = SecurityEngine(str(tmp_path))
    all_findings = await engine.run_full_scan()
    assert len(all_findings) >= 2


def test_clean_json_response_strict_markdown():
    markdown_json = """```json
    {
      "is_real_threat": true,
      "confidence_score": 95.0,
      "mitigation_diff": "--- a/test\\n+++ b/test",
      "explanation": "Vulnerabilidad confirmada"
    }
    ```"""
    parsed = _clean_json_response(markdown_json)
    assert parsed["is_real_threat"] is True
    assert parsed["confidence_score"] == 95.0
    assert parsed["explanation"] == "Vulnerabilidad confirmada"


def test_clean_json_response_heuristic_fallback():
    fallback_text = "Se descarta como falso positivo porque la variable está casteada a entero."
    parsed = _clean_json_response(fallback_text)
    assert parsed["is_real_threat"] is False
    assert parsed["confidence_score"] == 30.0
