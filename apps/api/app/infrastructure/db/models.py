from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy import Enum as SQLAlchemyEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.graph_models import EdgeType, NodeLabel
from app.domain.kanban_models import (
    EpicStatus,
    SprintStatus,
    TicketPriority,
    TicketStatus,
    TicketType,
)
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
    cached_schema: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    schema_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    schema_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class SchemaDraftModel(Base):
    __tablename__ = "schema_drafts"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    schema_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
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


class OmniNoteModel(Base):
    __tablename__ = "omni_notes"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    project_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
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


class ASTVectorModel(Base):
    __tablename__ = "vec_ast_nodes"

    node_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    content: Mapped[str] = mapped_column(String, nullable=False)
    embedding: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)


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
    type: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="code_analysis", default="code_analysis"
    )
    content: Mapped[str] = mapped_column(String, nullable=False)
    ai_model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    structural_metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, server_default="0", default=False, nullable=False
    )




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


class EpicModel(Base):
    __tablename__ = "epics"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    color: Mapped[str] = mapped_column(String(50), nullable=False, default="bg-blue-500")
    status: Mapped[EpicStatus] = mapped_column(
        SQLAlchemyEnum(EpicStatus), nullable=False, default=EpicStatus.ACTIVE
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class SprintModel(Base):
    __tablename__ = "sprints"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    goal: Mapped[str] = mapped_column(Text, nullable=False, default="")
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[SprintStatus] = mapped_column(
        SQLAlchemyEnum(SprintStatus), nullable=False, default=SprintStatus.PLANNED
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class KanbanTicketModel(Base):
    __tablename__ = "kanban_tickets"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    report_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("analysis_reports.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[TicketType] = mapped_column(
        SQLAlchemyEnum(TicketType), nullable=False, default=TicketType.FEATURE
    )
    status: Mapped[TicketStatus] = mapped_column(
        SQLAlchemyEnum(TicketStatus), nullable=False, default=TicketStatus.TODO
    )
    priority: Mapped[TicketPriority] = mapped_column(
        SQLAlchemyEnum(TicketPriority), nullable=False, default=TicketPriority.MEDIUM
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    branch_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    epic_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("epics.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sprint_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("sprints.id", ondelete="SET NULL"), nullable=True, index=True
    )
    subtasks: Mapped[list | dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class KanbanTicketNodeModel(Base):
    __tablename__ = "kanban_ticket_nodes"

    ticket_id: Mapped[UUID] = mapped_column(
        ForeignKey("kanban_tickets.id", ondelete="CASCADE"), primary_key=True
    )
    node_id: Mapped[str] = mapped_column(
        ForeignKey("graph_nodes.id", ondelete="CASCADE"), primary_key=True
    )
    file_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)


class PromptRegistryModel(Base):
    __tablename__ = "prompt_registry"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    required_variables: Mapped[list | dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class CustomLLMProviderModel(Base):
    __tablename__ = "custom_llm_providers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    keyring_service_id: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ToolModelMappingModel(Base):
    __tablename__ = "tool_model_mappings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tool_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    provider_id: Mapped[str] = mapped_column(String(255), nullable=False)
    model_name: Mapped[str] = mapped_column(String(255), nullable=False)
    fallback_models: Mapped[list | dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class UniversalBookmarkModel(Base):
    __tablename__ = "universal_bookmarks"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    selected_text: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_line: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_line: Mapped[int | None] = mapped_column(Integer, nullable=True)
    item_type: Mapped[str] = mapped_column(String(50), nullable=False, default="document")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ModelHealthMetricModel(Base):
    __tablename__ = "model_health_metrics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    model_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    provider: Mapped[str] = mapped_column(String(100), nullable=False)
    total_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    timeout_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_latency_ms: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    avg_latency_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    last_latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_status: Mapped[str] = mapped_column(String(50), nullable=False, default="untested")
    last_called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class WBSDocumentModel(Base):
    __tablename__ = "wbs_documents"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    file_path: Mapped[str] = mapped_column(
        String(1024), nullable=False, default="docs/planning/current_plan.md"
    )
    markdown_content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class WBSDocumentVersionModel(Base):
    __tablename__ = "wbs_document_versions"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    markdown_content: Mapped[str] = mapped_column(Text, nullable=False)
    change_summary: Mapped[str | None] = mapped_column(String(255), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

