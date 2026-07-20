import asyncio
import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.ai_agent import AIAgent
from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.models import ConversationModel, MessageModel
from app.interfaces.api.v1.chat import SENSEI_SYSTEM_PROMPT_TEMPLATE

router = APIRouter()


class DocumentState:
    def __init__(self, file_path: str, content: str, version_id: int):
        self.file_path = file_path
        self.content = content
        self.version_id = version_id
        # We store the latest task that will trigger the linter
        self.lint_task: asyncio.Task | None = None


class ConnectionManager:
    def __init__(self):
        # Maps websocket to their current document state
        self.active_connections: dict[WebSocket, DocumentState] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[websocket] = DocumentState("", "", 0)

    def disconnect(self, websocket: WebSocket):
        state = self.active_connections.pop(websocket, None)
        if state and state.lint_task:
            state.lint_task.cancel()

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)


manager = ConnectionManager()


def apply_delta(content: str, change: dict) -> str:
    """
    Applies a Monaco content change delta to the current content string.
    Relies on rangeOffset and rangeLength.
    """
    offset = change.get("rangeOffset", 0)
    length = change.get("rangeLength", 0)
    text = change.get("text", "")

    # Python strings are unicode arrays. This works perfectly for ASCII/BMP.
    # For astral plane characters (emojis), Monaco's UTF-16 offsets might
    # slightly misalign with Python's len(), but for an MVP AST linter it is acceptable.
    # A true LSP implementation encodes/decodes UTF-16 here.
    return content[:offset] + text + content[offset + length :]


async def debounced_lint(websocket: WebSocket, state: DocumentState):
    """
    Waits 2000ms. If not cancelled by a new delta, runs the AST linter.
    """
    try:
        await asyncio.sleep(2.0)
        # TODO: Run actual tree-sitter AST auditing here.
        # For now, we mock the result to prove the pipeline works.
        if "function monolithic" in state.content.lower() or len(state.content.splitlines()) > 50:
            marker = {
                "type": "marker_update",
                "markers": [
                    {
                        "line": 1,
                        "column": 1,
                        "message": "🎓 Sensei: Posible God Object detectado. Haz clic para debatir.",
                        "severity": 3,  # Warning
                    }
                ],
            }
            await manager.send_personal_message(marker, websocket)
    except asyncio.CancelledError:
        # Expected when a new delta arrives before 2000ms
        pass


@router.websocket("/ws")
async def sync_endpoint(websocket: WebSocket, db: AsyncSession = Depends(get_db_session)):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            state = manager.active_connections[websocket]

            if msg_type == "full_sync":
                state.file_path = data.get("file_path", "")
                state.content = data.get("content", "")
                state.version_id = data.get("versionId", 0)

                if state.lint_task:
                    state.lint_task.cancel()
                asyncio.create_task(run_lint_immediate(websocket, state))

            elif msg_type == "delta_sync":
                expected_version = state.version_id + 1
                incoming_version = data.get("versionId", 0)

                if incoming_version != expected_version:
                    await manager.send_personal_message({"type": "sync_out_of_order"}, websocket)
                    continue

                changes = data.get("changes", [])
                for change in changes:
                    state.content = apply_delta(state.content, change)

                state.version_id = incoming_version

                if state.lint_task:
                    state.lint_task.cancel()
                state.lint_task = asyncio.create_task(debounced_lint(websocket, state))

            elif msg_type == "chat_request":
                # Unified Chat handling: same Worker, same AST in RAM
                messages = data.get("messages", [])
                model = data.get("model", "gemini-1.5-pro")
                project_id = data.get("project_id", 1)

                # Retrieve or create Conversation
                conversation_id = data.get("conversation_id")
                is_new_conversation = False
                if not conversation_id:
                    conv = ConversationModel(project_id=project_id)
                    db.add(conv)
                    await db.commit()
                    await db.refresh(conv)
                    conversation_id = conv.id
                    is_new_conversation = True

                injected_system = SENSEI_SYSTEM_PROMPT_TEMPLATE

                # Inject Project Awareness
                if project_id:
                    import uuid

                    from app.infrastructure.ai.project_scanner import get_project_awareness_xml
                    from app.infrastructure.db.models import ProjectModel
                    try:
                        project_uuid = uuid.UUID(str(project_id))
                        proj = await db.get(ProjectModel, project_uuid)
                        if proj and proj.path:
                            awareness_xml = await get_project_awareness_xml(proj.path)
                            if awareness_xml:
                                injected_system += f"\n\n{awareness_xml}"
                    except Exception as e:
                        print(f"Failed to inject project awareness: {e}")

                # Shadow AST Context Injection
                cursor_line = data.get("cursor_line", 1)
                open_tabs = data.get("open_tabs", [])

                if state.content.strip():
                    injected_system += f"\n\n<EDITOR_CONTEXT>\nFile: {state.file_path}\nCursor Line: {cursor_line}\nActive Code:\n{state.content[:4000]}\n</EDITOR_CONTEXT>"

                if open_tabs:
                    tabs_str = "\n".join([f"- {t}" for t in open_tabs])
                    injected_system += f"\n\n<OPEN_TABS>\nEl usuario tiene las siguientes pestañas abiertas en el IDE:\n{tabs_str}\n</OPEN_TABS>"

                if messages and messages[0].get("role") == "system":
                    messages[0] = {"role": "system", "content": injected_system}
                else:
                    messages.insert(0, {"role": "system", "content": injected_system})

                # Save user message with snapshot
                user_content = messages[-1].get("content", "") if messages else ""
                user_msg = MessageModel(
                    conversation_id=conversation_id,
                    role="user",
                    content=user_content,
                    context_snapshot={
                        "file_path": state.file_path,
                        "cursor_line": cursor_line,
                        "open_tabs": open_tabs,
                        "active_code_preview": state.content[:100] + "..." if state.content else ""
                    }
                )
                db.add(user_msg)
                await db.commit()

                if is_new_conversation and user_content:
                    from app.interfaces.api.v1.chat import _generate_conversation_title
                    asyncio.create_task(_generate_conversation_title(conversation_id, user_content))

                # We launch the generation in a background task so we don't block the delta syncing loop!
                asyncio.create_task(
                    stream_chat_response(
                        websocket, db, project_id, model, messages, data.get("message_id"), conversation_id
                    )
                )

    except WebSocketDisconnect:
        manager.disconnect(websocket)


async def stream_chat_response(
    websocket: WebSocket,
    session: AsyncSession,
    project_id: str,
    model: str,
    messages: list,
    message_id: str,
    conversation_id: int,
):
    full_response = ""
    try:
        agent = AIAgent(session=session, project_id=project_id)
        async for chunk_str in agent.chat_stream(messages, model=model):
            # Parse the SSE chunk string if it's JSON to send nicely over WS,
            # AIAgent yields JSON strings with 'text' and 'is_done'
            try:
                chunk_data = json.loads(chunk_str)
                text = chunk_data.get("text", "")
                full_response += text
                await manager.send_personal_message(
                    {
                        "type": "chat_chunk",
                        "message_id": message_id,
                        "text": text,
                        "is_done": chunk_data.get("is_done", False),
                    },
                    websocket,
                )
            except:
                pass
        await websocket.send_json(
            {"type": "chat_response", "data": json.dumps({"is_done": True, "conversation_id": conversation_id})}
        )

        # The message is saved in the finally block below
    except Exception as e:
        print(f"WS Chat Stream Error: {e}")
        await websocket.send_json(
            {
                "type": "chat_response",
                "data": json.dumps({"text": f"Error: {str(e)}", "is_done": True, "error": True, "conversation_id": conversation_id}),
            }
        )
    finally:
        if full_response.strip():
            try:
                bot_msg = MessageModel(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_response,
                )
                session.add(bot_msg)
                await session.commit()
            except Exception:
                # If the socket gets destroyed completely or the DB connection drops,
                # we do a best-effort save.
                pass


async def run_lint_immediate(websocket: WebSocket, state: DocumentState):
    """Runs linting without delay for full_sync / handshake."""
    if "function monolithic" in state.content.lower() or len(state.content.splitlines()) > 50:
        marker = {
            "type": "marker_update",
            "markers": [
                {
                    "line": 1,
                    "column": 1,
                    "message": "🎓 Sensei: Posible God Object detectado. Haz clic para debatir.",
                    "severity": 3,
                }
            ],
        }
        await manager.send_personal_message(marker, websocket)
