from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.domain.kanban_models import TicketPriority, TicketStatus, TicketType
from app.domain.kanban_schemas import KanbanTicketCreate, KanbanTicketResponse, KanbanTicketUpdate
from app.interfaces.api.v1.kanban import update_ticket


def test_ticket_status_enum_includes_test():
    assert TicketStatus.TEST == "test"
    assert "test" in [s.value for s in TicketStatus]


def test_kanban_ticket_schemas_support_test_status():
    create_payload = KanbanTicketCreate(
        title="Verify Test Column",
        description="Ticket in test column",
        status=TicketStatus.TEST,
    )
    assert create_payload.status == TicketStatus.TEST

    update_payload = KanbanTicketUpdate(status=TicketStatus.TEST)
    assert update_payload.status == TicketStatus.TEST


@pytest.mark.asyncio
async def test_update_ticket_endpoint_accepts_test_status():
    ticket_id = str(uuid4())
    mock_session = AsyncMock()
    now = datetime.now(UTC)

    mock_response = KanbanTicketResponse(
        id=uuid4(),
        project_id=uuid4(),
        title="Verify Test Column",
        type=TicketType.FEATURE,
        status=TicketStatus.TEST,
        priority=TicketPriority.MEDIUM,
        description="Ticket updated to test status",
        subtasks=[],
        created_at=now,
        updated_at=now,
        affected_nodes=[],
    )

    with patch("app.interfaces.api.v1.kanban.SQLAlchemyKanbanRepository") as mock_repo_cls:
        repo_instance = AsyncMock()
        repo_instance.update_ticket.return_value = mock_response
        mock_repo_cls.return_value = repo_instance

        payload = KanbanTicketUpdate(status=TicketStatus.TEST)
        result = await update_ticket(
            ticket_id=ticket_id,
            payload=payload,
            session=mock_session,
        )

        assert result.status == TicketStatus.TEST
        repo_instance.update_ticket.assert_called_once()
