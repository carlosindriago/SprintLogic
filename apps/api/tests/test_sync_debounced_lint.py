"""Regression tests for debounced_lint (item #21: was a no-op stub).

debounced_lint's contract, per its own docstring, is "waits 2000ms; if not
cancelled by a new delta, runs the linter" - before this fix it waited and
then did nothing at all, silently dropping the promised behavior.
"""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.interfaces.api.v1.sync import DocumentState, debounced_lint


@pytest.mark.asyncio
async def test_runs_the_linter_after_the_debounce_delay():
    state = DocumentState(file_path="a.py", content="x = 1", version_id=1)
    websocket = AsyncMock()

    with (
        patch("app.interfaces.api.v1.sync.asyncio.sleep", new=AsyncMock()),
        patch(
            "app.interfaces.api.v1.sync.run_lint_immediate", new=AsyncMock()
        ) as mock_lint,
    ):
        await debounced_lint(websocket, state)

    mock_lint.assert_awaited_once_with(websocket, state)


@pytest.mark.asyncio
async def test_cancellation_before_the_delay_skips_the_linter():
    state = DocumentState(file_path="a.py", content="x = 1", version_id=1)
    websocket = AsyncMock()

    async def cancel_immediately(_seconds):
        raise asyncio.CancelledError()

    with (
        patch("app.interfaces.api.v1.sync.asyncio.sleep", new=cancel_immediately),
        patch(
            "app.interfaces.api.v1.sync.run_lint_immediate", new=AsyncMock()
        ) as mock_lint,
    ):
        # debounced_lint swallows CancelledError itself (expected: a new
        # delta arrived and cancelled the pending lint task) - it must not
        # propagate, and the linter must never have run.
        await debounced_lint(websocket, state)

    mock_lint.assert_not_awaited()
