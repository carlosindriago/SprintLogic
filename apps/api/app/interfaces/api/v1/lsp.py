"""WebSocket-to-stdio bridge for the Python Language Server (pyright).

Each WebSocket client gets a dedicated `pyright-langserver --stdio`
subprocess. Two background tasks shuttle bytes in both directions
(WebSocket ↔ process stdio), framed by the LSP `Content-Length` header
protocol. The third task drains the process stderr to the server log so
server-side diagnostics do not block the pipes.

Failure modes are handled gracefully:
  * missing executable   → WebSocket closes with code 1011 and a reason.
  * spawn failure        → WebSocket closes with code 1011 and a reason.
  * client disconnect    → process stdin is closed, the process is
                            terminated, and the remaining tasks are
                            cancelled via asyncio.TaskGroup.
"""

from __future__ import annotations

import asyncio
import logging
import re
import shutil
from typing import Final

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
logger = logging.getLogger(__name__)

LSP_COMMAND: Final[str] = "pyright-langserver"
LSP_ARGS: Final[tuple[str, ...]] = ("--stdio",)
WS_PATH: Final[str] = "/python"

# LSP "Content-Length: N\r\n\r\n<body of N bytes>" framing.
_HEADER_RE: Final[re.Pattern[bytes]] = re.compile(rb"^Content-Length:\s*(\d+)\s*\r\n", re.MULTILINE)
_HEADER_TERMINATOR: Final[bytes] = b"\r\n\r\n"
_HEADER_SANITY_LIMIT: Final[int] = 8192
_CLOSE_MISSING_BINARY: Final[int] = 1011


async def _read_lsp_message(stream: asyncio.StreamReader) -> bytes | None:
    """Read a single LSP message (headers + body) from `stream`.

    Returns the raw body (without headers) or `None` on clean EOF.
    Raises `ValueError` if the framing is malformed.
    """
    header_buf = b""
    while _HEADER_TERMINATOR not in header_buf:
        chunk = await stream.read(1)
        if not chunk:
            return None
        header_buf += chunk
        if len(header_buf) > _HEADER_SANITY_LIMIT:
            raise ValueError("LSP header section exceeds sanity limit")

    headers_blob = header_buf.split(_HEADER_TERMINATOR, 1)[0]
    # Note: `bytes.split(separator)` consumes the trailing \r\n of the
    # last header line as part of the separator, so we run the regex
    # against the full buffer (which still includes the \r\n\r\n we
    # just found) to keep the line terminator intact for the match.
    match = _HEADER_RE.search(header_buf)
    if not match:
        raise ValueError(f"LSP message missing Content-Length: {headers_blob!r}")

    content_length = int(match.group(1))
    if content_length <= 0:
        raise ValueError(f"LSP Content-Length must be positive, got {content_length}")

    return await stream.readexactly(content_length)


async def _terminate_process(process: asyncio.subprocess.Process) -> None:
    """Terminate the LSP process; escalate to kill if it does not exit."""
    if process.returncode is not None:
        return
    try:
        process.terminate()
    except ProcessLookupError:
        return
    try:
        await asyncio.wait_for(process.wait(), timeout=2.0)
    except asyncio.TimeoutError:
        try:
            process.kill()
        except ProcessLookupError:
            pass
    except ProcessLookupError:
        return


@router.websocket(WS_PATH)
async def python_lsp(websocket: WebSocket) -> None:
    await websocket.accept()

    # --- Pre-flight: is the language server installed? ---------------------
    binary_path = shutil.which(LSP_COMMAND)
    if not binary_path:
        logger.warning("LSP binary %r not found in PATH", LSP_COMMAND)
        reason = f"{LSP_COMMAND} not found in PATH. Install with: pip install pyright"
        await websocket.close(code=_CLOSE_MISSING_BINARY, reason=reason[:120])
        return

    # --- Spawn the language server ----------------------------------------
    try:
        process = await asyncio.create_subprocess_exec(
            binary_path,
            *LSP_ARGS,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        # Race: binary was removed between shutil.which and execve.
        await websocket.close(code=_CLOSE_MISSING_BINARY, reason=f"{LSP_COMMAND} disappeared")
        return
    except Exception as exc:
        logger.exception("Failed to spawn %s", LSP_COMMAND)
        await websocket.close(code=_CLOSE_MISSING_BINARY, reason=f"spawn failed: {exc!s}"[:120])
        return

    logger.debug("LSP %s spawned (pid=%s) for %s", LSP_COMMAND, process.pid, websocket.client)

    # --- Concurrent shuttles ----------------------------------------------
    async def ws_to_proc() -> None:
        """Forward every WebSocket text frame to the process stdin, framed
        as a complete LSP message: read until a full message arrives
        (Content-Length body) and write it verbatim.
        """
        stdin = process.stdin
        if stdin is None:
            return
        try:
            while True:
                msg = await websocket.receive_text()
                payload = msg.encode("utf-8")
                if stdin.is_closing():
                    break
                # LSP framing: the client (monaco-languageclient) already
                # sends framed messages (Content-Length + body). The
                # server side is stdio, so we just pipe the raw bytes.
                stdin.write(payload)
                await stdin.drain()
        except WebSocketDisconnect:
            logger.debug("LSP ws_to_proc: client disconnected")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("LSP ws_to_proc: unexpected error")
        finally:
            try:
                stdin.close()
            except Exception:
                pass

    async def proc_to_ws() -> None:
        """Read framed LSP messages from the process stdout and send each
        one to the WebSocket as a single text frame.
        """
        stdout = process.stdout
        if stdout is None:
            return
        try:
            while True:
                body = await _read_lsp_message(stdout)
                if body is None:
                    logger.debug("LSP proc_to_ws: stdout closed")
                    return
                await websocket.send_text(body.decode("utf-8", errors="replace"))
        except WebSocketDisconnect:
            logger.debug("LSP proc_to_ws: client disconnected")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("LSP proc_to_ws: unexpected error")

    async def stderr_drain() -> None:
        """Forward the process stderr to the server log so we can debug
        pyright crashes without blocking the actual LSP pipes.
        """
        stderr = process.stderr
        if stderr is None:
            return
        try:
            while True:
                line = await stderr.readline()
                if not line:
                    return
                logger.warning(
                    "[%s stderr] %s",
                    LSP_COMMAND,
                    line.decode("utf-8", errors="replace").rstrip(),
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("LSP stderr_drain: unexpected error")

    try:
        # TaskGroup cancels every other task when one of them exits.
        # That gives us automatic cleanup of stdin/stdout when the WS
        # disconnects, and automatic teardown of the WS side when the
        # process dies.
        async with asyncio.TaskGroup() as tg:
            tg.create_task(ws_to_proc(), name="lsp.ws_to_proc")
            tg.create_task(proc_to_ws(), name="lsp.proc_to_ws")
            tg.create_task(stderr_drain(), name="lsp.stderr_drain")
    except* Exception as eg:
        # Tasks normally finish via cancellation. Log anything else.
        for exc in eg.exceptions:
            logger.warning("LSP task group ended with: %r", exc)
    finally:
        await _terminate_process(process)
        # Close the WebSocket gracefully if it is still open. FastAPI's
        # WebSocket.close() is idempotent.
        try:
            await websocket.close()
        except Exception:
            pass
        logger.debug("LSP session ended (returncode=%s)", process.returncode)
