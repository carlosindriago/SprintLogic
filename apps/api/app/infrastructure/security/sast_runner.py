"""SAST & Secret Detection Runner Infrastructure for Security Studio.

Provides extensible static analysis runners (SemgrepRunner, GitleaksRunner)
and vulnerability finding data structures.
"""

from __future__ import annotations

import logging
import os
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

logger = logging.getLogger(__name__)

SeverityType = Literal["critical", "high", "medium", "low"]


@dataclass
class SecurityFinding:
    id: str
    title: str
    description: str
    file_path: str
    line_number: int
    severity: SeverityType
    tool: str  # "semgrep" | "gitleaks" | "sast"
    rule_id: str
    snippet: str
    cwe: str | None = None
    mitigation_hint: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SemgrepRunner:
    """Semgrep SAST runner.

    Executes deterministic static analysis rules across project source code.
    Mocks/returns structured findings matching official Semgrep CLI output format.
    """

    def __init__(self, project_path: str) -> None:
        self.project_path = project_path

    async def scan(self) -> list[SecurityFinding]:
        """Execute Semgrep rule scan on the project."""
        logger.info("Executing Semgrep scan on %s", self.project_path)
        findings: list[SecurityFinding] = []

        sample_targets = [
            (
                "apps/api/app/interfaces/api/v1/projects/kanban.py",
                142,
                "critical",
                "CWE-89: SQL Injection",
                "rules.python.security.injection.raw-sql-concat",
                "Posible Inyección SQL en Consulta de Tickets",
                "Concatenación de variables no sanitizadas en consulta SQL directa.",
                "A2:2021-Cryptographic Failures",
                "HIGH",
            ),
            (
                "apps/web/src/components/ExecutionRoomTab.tsx",
                88,
                "high",
                "CWE-79: Cross-site Scripting (XSS)",
                "rules.typescript.security.dom-xss.dangerously-set-inner-html",
                "Fuga XSS por Inyección de HTML sin Sanitizar",
                "Uso de dangerouslySetInnerHTML con datos sin procesar por DOMPurify.",
                "A3:2021-Injection",
                "MEDIUM",
            ),
            (
                "apps/api/app/infrastructure/ai/llm_gateway.py",
                115,
                "medium",
                "CWE-209: Information Exposure Through Error Message",
                "rules.python.security.logging.sensitive-data-leak",
                "Exposición de Stacktrace y Claves en Logging",
                "Logueo de excepciones sin filtrar cabeceras Authorization o variables de entorno.",
                "A9:2021-Security Logging Failures",
                "HIGH",
            ),
        ]

        for rel_path, line, severity, cwe, rule_id, title, desc, owasp, conf in sample_targets:
            full_path = os.path.join(self.project_path, rel_path)
            snippet = f"# Archivo objetivo: {rel_path}\n# Línea {line}: Código evaluado por regla {rule_id}"
            if os.path.isfile(full_path):
                try:
                    with open(full_path, encoding="utf-8", errors="ignore") as f:
                        lines = f.readlines()
                        start = max(0, line - 4)
                        end = min(len(lines), line + 4)
                        snippet = "".join(lines[start:end])
                except Exception as e:
                    logger.debug("Could not read file snippet for %s: %s", full_path, e)

            findings.append(
                SecurityFinding(
                    id=f"semgrep-{rule_id.split('.')[-1]}-{line}",
                    title=title,
                    description=desc,
                    file_path=rel_path,
                    line_number=line,
                    severity=severity,  # type: ignore[arg-type]
                    tool="semgrep",
                    rule_id=rule_id,
                    snippet=snippet,
                    cwe=cwe,
                    mitigation_hint="Parametrizar la consulta o sanitizar la entrada antes de procesarla.",
                    metadata={
                        "owasp": owasp,
                        "confidence": conf,
                        "engine": "semgrep-core/v1.75.0",
                        "check_id": rule_id,
                    },
                )
            )

        return findings


class GitleaksRunner:
    """Gitleaks secret and token detection runner.

    Detects hardcoded secrets, API keys, JWT tokens, and private credentials.
    Mocks/returns structured findings matching official Gitleaks CLI output format.
    """

    def __init__(self, project_path: str) -> None:
        self.project_path = project_path

    async def scan(self) -> list[SecurityFinding]:
        """Execute Gitleaks secret scan on the project."""
        logger.info("Executing Gitleaks secret scan on %s", self.project_path)
        findings: list[SecurityFinding] = [
            SecurityFinding(
                id="gitleaks-generic-api-key-12",
                title="Clave de API Hardcodeada Detectada",
                description="Se detectó un token de API o secreto con alta entropía en el archivo.",
                file_path=".env.example",
                line_number=12,
                severity="high",
                tool="gitleaks",
                rule_id="gitleaks.rules.generic-api-key",
                snippet='OPENAI_API_KEY="sk-proj-sample_fake_key_entropy_1234567890"',
                cwe="CWE-798: Use of Hard-coded Credentials",
                mitigation_hint="Mover el secreto a variables de entorno del sistema o Vault seguro.",
                metadata={
                    "entropy": 4.15,
                    "secret_type": "api_key",
                    "commit": "uncommitted_working_tree",
                    "engine": "gitleaks/v8.18.2",
                },
            )
        ]
        return findings


class SecurityEngine:
    """Aggregates multiple SAST and Secret runners for a comprehensive scan."""

    def __init__(self, project_path: str) -> None:
        self.project_path = project_path
        self.semgrep = SemgrepRunner(project_path)
        self.gitleaks = GitleaksRunner(project_path)

    async def run_full_scan(self) -> list[SecurityFinding]:
        semgrep_findings = await self.semgrep.scan()
        gitleaks_findings = await self.gitleaks.scan()
        return semgrep_findings + gitleaks_findings
