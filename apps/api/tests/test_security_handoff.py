from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.domain.kanban_models import TicketPriority, TicketType
from app.domain.kanban_schemas import SecurityTicketHandoffRequest
from app.interfaces.api.v1.kanban import create_ticket_from_security


def test_security_ticket_handoff_request_schema():
    payload = SecurityTicketHandoffRequest(
        finding_id="semgrep-sql-injection-142",
        title="Posible Inyección SQL en Consulta de Tickets",
        description="Concatenación directa de variables en SQL",
        severity="critical",
        file_path="apps/api/app/interfaces/api/v1/projects/kanban.py",
        line_number=142,
        cwe="CWE-89: SQL Injection",
        rule_id="rules.python.security.injection.raw-sql-concat",
        mitigation_diff="--- a/test\n+++ b/test",
        affected_nodes=["apps/api/app/interfaces/api/v1/projects/kanban.py"],
    )
    assert payload.finding_id == "semgrep-sql-injection-142"
    assert payload.severity == "critical"
    assert payload.line_number == 142
    assert len(payload.affected_nodes) == 1


@pytest.mark.asyncio
async def test_create_ticket_from_security_endpoint():
    project_id = str(uuid4())
    payload = SecurityTicketHandoffRequest(
        finding_id="gitleaks-api-key-12",
        title="Clave de API Hardcodeada",
        description="Se detectó clave con alta entropía",
        severity="high",
        file_path=".env.example",
        line_number=12,
        cwe="CWE-798",
        rule_id="gitleaks.rules.generic-api-key",
    )

    mock_session = AsyncMock()
    mock_ticket = AsyncMock()
    mock_ticket.id = uuid4()
    mock_ticket.title = "[Security Fix] - Clave de API Hardcodeada"
    mock_ticket.type = TicketType.SECURITY
    mock_ticket.priority = TicketPriority.HIGH

    with patch("app.interfaces.api.v1.kanban.SQLAlchemyKanbanRepository") as mock_kanban_repo:
        repo_instance = AsyncMock()
        repo_instance.create_ticket.return_value = mock_ticket
        mock_kanban_repo.return_value = repo_instance

        result = await create_ticket_from_security(
            project_id=project_id,
            payload=payload,
            session=mock_session,
        )

        assert result.title == "[Security Fix] - Clave de API Hardcodeada"
        assert result.type == TicketType.SECURITY
        assert result.priority == TicketPriority.HIGH
        repo_instance.create_ticket.assert_called_once()

        # Verify strict backlog creation payload
        created_payload = repo_instance.create_ticket.call_args[0][1]
        assert created_payload.sprint_id is None
        assert created_payload.epic_id is None
        assert created_payload.priority == TicketPriority.HIGH


@pytest.mark.asyncio
async def test_critical_vulnerability_strictly_routes_to_backlog():
    """Verify that even CRITICAL vulnerabilities route strictly to Backlog without sprint assignment."""
    project_id = str(uuid4())
    payload = SecurityTicketHandoffRequest(
        finding_id="semgrep-rce-crit",
        title="Remote Code Execution via Deserialization",
        description="Insecure pickle load detected in payload handler",
        severity="critical",
        file_path="apps/api/main.py",
        line_number=45,
        cwe="CWE-502",
        rule_id="python.security.deserialization.insecure-pickle",
    )

    mock_session = AsyncMock()
    mock_ticket = AsyncMock()
    mock_ticket.id = uuid4()
    mock_ticket.type = TicketType.SECURITY
    mock_ticket.priority = TicketPriority.HIGH

    with patch("app.interfaces.api.v1.kanban.SQLAlchemyKanbanRepository") as mock_kanban_repo:
        repo_instance = AsyncMock()
        repo_instance.create_ticket.return_value = mock_ticket
        mock_kanban_repo.return_value = repo_instance

        result = await create_ticket_from_security(
            project_id=project_id,
            payload=payload,
            session=mock_session,
        )

        assert result.priority == TicketPriority.HIGH
        created_payload = repo_instance.create_ticket.call_args[0][1]
        # Strict Backlog Invariant: MUST NOT be assigned to any sprint
        assert created_payload.sprint_id is None
        assert created_payload.epic_id is None

