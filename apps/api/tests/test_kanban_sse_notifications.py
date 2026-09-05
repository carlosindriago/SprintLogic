"""Regression tests for the Kanban board's live-update SSE plumbing.

Two independent gaps existed:

1. `file_watcher.add_callback(file_watcher_callback)` was never called
   anywhere, so an external edit to tasks.md (another tab, a `git pull`, a
   hand edit, or an external agent editing the file directly) never reached
   the `/projects/{id}/events` SSE stream the Kanban board listens on -
   despite the callback, the queue, the SSE endpoint and the frontend
   listener all already existing.
2. Saving the board through the API (`POST /projects/{id}/tasks`) writes
   tasks.md via `kanban_sync.write_tasks`, which the file watcher
   intentionally ignores (see `FileWatcherService.mark_backend_write`) to
   avoid re-triggering itself - but nothing pushed the notification in its
   place, so a second open tab (or a caller that isn't the tab that just
   saved) never found out the board changed.
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest


@pytest.mark.asyncio
async def test_push_project_event_delivers_to_every_open_subscriber():
    from app.interfaces.api.v1.projects.ws import project_event_queues, push_project_event

    project_id = str(uuid4())
    q1: AsyncMock = __import__("asyncio").Queue()
    q2 = __import__("asyncio").Queue()
    project_event_queues[project_id] = [q1, q2]
    try:
        await push_project_event(project_id, {"type": "kanban_update"})

        assert q1.get_nowait() == {"type": "kanban_update"}
        assert q2.get_nowait() == {"type": "kanban_update"}
    finally:
        del project_event_queues[project_id]


@pytest.mark.asyncio
async def test_push_project_event_is_a_noop_with_no_subscribers():
    from app.interfaces.api.v1.projects.ws import push_project_event

    # No project registered in project_event_queues at all - must not raise.
    await push_project_event(str(uuid4()), {"type": "kanban_update"})


def test_file_watcher_callback_is_registered_on_app_import():
    """Regression for gap #1: importing the app must wire the callback that
    turns external tasks.md changes into a kanban_update SSE event."""
    import app.main  # noqa: F401 - importing wires the callback as a side effect
    from app.infrastructure.file_watcher import file_watcher
    from app.interfaces.api.v1.projects.ws import file_watcher_callback

    assert file_watcher_callback in file_watcher._on_change_callbacks


@pytest.mark.asyncio
async def test_save_project_tasks_notifies_open_subscribers():
    """Regression for gap #2: saving the board via the API must notify any
    other open SSE subscriber for the same project, since the file watcher
    itself will ignore this write as a backend-originated one."""
    from app.interfaces.api.v1.projects.kanban import SaveTasksRequest, save_project_tasks
    from app.interfaces.api.v1.projects.ws import project_event_queues

    project_id = str(uuid4())
    q = __import__("asyncio").Queue()
    project_event_queues[project_id] = [q]

    mock_project = AsyncMock(path="/tmp/fake-project")
    mock_session = AsyncMock()

    try:
        with (
            patch(
                "app.interfaces.api.v1.projects.kanban.SQLAlchemyProjectRepository"
            ) as mock_repo_cls,
            patch("app.interfaces.api.v1.projects.kanban.kanban_sync") as mock_kanban_sync,
        ):
            repo_instance = AsyncMock()
            repo_instance.get_project.return_value = mock_project
            mock_repo_cls.return_value = repo_instance
            mock_kanban_sync.write_tasks = lambda *a, **k: None

            result = await save_project_tasks(
                project_id=project_id,
                request=SaveTasksRequest(tasks=[{"id": "SPRT-1", "content": "x", "status": "todo"}]),
                session=mock_session,
            )

        assert result == {"status": "success"}
        assert q.get_nowait() == {"type": "kanban_update"}
    finally:
        del project_event_queues[project_id]
