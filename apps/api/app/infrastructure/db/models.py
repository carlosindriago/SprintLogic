from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, LargeBinary, String
from sqlalchemy import Enum as SQLAlchemyEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.graph_models import EdgeType, NodeLabel
from app.infrastructure.db.database import Base


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class GraphNodeModel(Base):
    __tablename__ = "graph_nodes"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[NodeLabel] = mapped_column(SQLAlchemyEnum(NodeLabel), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    meta_data: Mapped[str | None] = mapped_column(String, nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    loc: Mapped[int | None] = mapped_column(Integer, nullable=True)


class GraphEdgeModel(Base):
    __tablename__ = "graph_edges"

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    source_id: Mapped[str] = mapped_column(
        ForeignKey("graph_nodes.id", ondelete="CASCADE"), primary_key=True
    )
    target_id: Mapped[str] = mapped_column(
        ForeignKey("graph_nodes.id", ondelete="CASCADE"), primary_key=True
    )
    type: Mapped[EdgeType] = mapped_column(SQLAlchemyEnum(EdgeType), primary_key=True)


class ProjectModel(Base):
    __tablename__ = "projects"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    last_opened: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )


class AIMemoryModel(Base):
    __tablename__ = "ai_memories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )
    memory_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # e.g. "decision", "summary"
    topic: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    content: Mapped[str] = mapped_column(String, nullable=False)  # Text equivalent
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, index=True
    )


class ContextSnippetModel(Base):
    __tablename__ = "context_snippets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. "dependency", "doc"
    content: Mapped[str] = mapped_column(String, nullable=False)
    # The actual vectors will be stored in a raw sqlite-vec virtual table `vec_context_snippets`
    # linked by rowid = ContextSnippetModel.id

class DeveloperInsightModel(Base):
    __tablename__ = "developer_insights"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    conversation_id: Mapped[str] = mapped_column(String, nullable=False)
    sintoma: Mapped[str] = mapped_column(String, nullable=False)
    solucion: Mapped[str] = mapped_column(String, nullable=False)
    snippet_corregido: Mapped[str | None] = mapped_column(String, nullable=True)
    embedding_blob: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

class ASTNodeMapModel(Base):
    __tablename__ = "ast_node_map"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    fqn: Mapped[str] = mapped_column(String(1024), nullable=False, index=True)
    node_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)





class ConversationModel(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    insight_extracted: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class MessageModel(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    context_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class AnalysisReportModel(Base):
    __tablename__ = "analysis_reports"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content: Mapped[str] = mapped_column(String, nullable=False)
    ai_model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    structural_metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )

from sqlalchemy import BigInteger


class SearchIndexModel(Base):
    __tablename__ = "search_index"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    type: Mapped[str | None] = mapped_column(String, nullable=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    path: Mapped[str | None] = mapped_column(String, nullable=True)
    content: Mapped[str | None] = mapped_column(String, nullable=True)
    line: Mapped[int | None] = mapped_column(Integer, nullable=True)



class ProjectMemoryModel(Base):
    __tablename__ = "project_memories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str | None] = mapped_column(String, nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String, nullable=True)
    context_type: Mapped[str | None] = mapped_column(String, nullable=True)
    memory_content: Mapped[str | None] = mapped_column(String, nullable=True)



class AdrChunkModel(Base):
    __tablename__ = "adr_chunks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    filepath: Mapped[str] = mapped_column(String, nullable=False)
    file_hash: Mapped[str] = mapped_column(String, nullable=False)
    chunk_text: Mapped[str] = mapped_column(String, nullable=False)
    breadcrumbs: Mapped[str | None] = mapped_column(String, nullable=True)



class TelemetryPingModel(Base):
    __tablename__ = "telemetry_pings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    project_id: Mapped[str | None] = mapped_column(String, nullable=True)
    window_start_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    window_end_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    thinking_ms: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    coding_ms: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    testing_ms: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

class DaemonLockModel(Base):
    __tablename__ = "daemon_locks"

    project_id: Mapped[str] = mapped_column(String, primary_key=True)
    rule: Mapped[str] = mapped_column(String, primary_key=True)
    last_fired_at: Mapped[str] = mapped_column(String, nullable=False)
