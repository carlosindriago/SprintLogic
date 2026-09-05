"""Regression tests for stream_chat_response's per-chunk exception handling.

Covers the bare `except: pass` bug in app/interfaces/api/v1/sync.py: it used
to swallow every exception, including asyncio.CancelledError, which broke
cooperative cancellation of the streaming task on disconnect/shutdown, and
silently dropped malformed chunks with no log at all.
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.interfaces.api.v1.sync import stream_chat_response


class _FakeAgent:
    """Stands in for AIAgent; chat_stream yields exactly what the test wants."""

    def __init__(self, chunks):
        self._chunks = chunks

    async def chat_stream(self, messages, model):
        for chunk in self._chunks:
            if isinstance(chunk, BaseException):
                raise chunk
            yield chunk


@pytest.mark.asyncio
async def test_malformed_chunk_is_logged_and_skipped_not_swallowed_silently(caplog):
    """A malformed chunk must not crash the stream, and must be logged."""
    chunks = [
        json.dumps({"text": "Hola ", "is_done": False}),
        "this is not valid json",
        json.dumps({"text": "mundo", "is_done": True}),
    ]

    websocket = AsyncMock()
    # session.add() is synchronous in real SQLAlchemy; only .commit() is
    # awaited. A blanket AsyncMock() would make .add() return an unawaited
    # coroutine and spuriously warn.
    session = MagicMock(commit=AsyncMock())

    with (
        patch("app.interfaces.api.v1.sync.AIAgent", return_value=_FakeAgent(chunks)),
        patch(
            "app.interfaces.api.v1.sync.manager.send_personal_message", new=AsyncMock()
        ) as mock_send,
        caplog.at_level("WARNING"),
    ):
        await stream_chat_response(
            websocket, session, "proj-1", "some-model", [], "msg-1", conversation_id=42
        )

    # Both valid chunks were forwarded to the client; the malformed one wasn't.
    assert mock_send.call_count == 2
    sent_texts = [call.args[0]["text"] for call in mock_send.call_args_list]
    assert sent_texts == ["Hola ", "mundo"]

    # The malformed chunk was logged, not silently dropped.
    assert any("malformed chat stream chunk" in rec.message.lower() for rec in caplog.records)

    # The stream completed successfully (not the error path).
    websocket.send_json.assert_awaited_once()
    completion_payload = json.loads(websocket.send_json.await_args.args[0]["data"])
    assert completion_payload == {"is_done": True, "conversation_id": 42}

    # The assistant's full (valid-chunks-only) response was persisted.
    session.add.assert_called_once()
    session.commit.assert_awaited()


@pytest.mark.asyncio
async def test_cancelled_error_propagates_instead_of_being_swallowed():
    """asyncio.CancelledError raised mid-stream must actually cancel the task.

    The cancellation must land on an `await` *inside* the inner try block
    (e.g. mid-send) to reproduce the real bug: a bare `except:` there used
    to swallow it and silently continue the loop instead of cancelling.
    Raising it from the fake chat_stream generator itself wouldn't touch
    the inner try at all (it'd propagate via `async for`, unrelated to the
    per-chunk except clause), so it wouldn't actually exercise the fix.
    """
    chunks = [
        json.dumps({"text": "primero", "is_done": False}),
        json.dumps({"text": "parcial", "is_done": False}),
    ]

    websocket = AsyncMock()
    # session.add() is synchronous in real SQLAlchemy; only .commit() is
    # awaited. A blanket AsyncMock() would make .add() return an unawaited
    # coroutine and spuriously warn.
    session = MagicMock(commit=AsyncMock())

    # First send succeeds; the second is where cancellation actually lands
    # (mid-await), same as it would in production.
    mock_send = AsyncMock(side_effect=[None, asyncio.CancelledError()])

    with (
        patch("app.interfaces.api.v1.sync.AIAgent", return_value=_FakeAgent(chunks)),
        patch("app.interfaces.api.v1.sync.manager.send_personal_message", new=mock_send),
    ):
        with pytest.raises(asyncio.CancelledError):
            await stream_chat_response(
                websocket, session, "proj-1", "some-model", [], "msg-1", conversation_id=42
            )

    # The error-response path (outer `except Exception`) must NOT have run:
    # CancelledError is a BaseException, not an Exception, and must propagate.
    websocket.send_json.assert_not_called()

    # `finally` still persists whatever partial response had accumulated.
    session.add.assert_called_once()
    session.commit.assert_awaited()
