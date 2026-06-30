from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, String, Enum as SQLAlchemyEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.database import Base
from app.domain.graph_models import NodeLabel, EdgeType


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class GraphNodeModel(Base):
    __tablename__ = "graph_nodes"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    label: Mapped[NodeLabel] = mapped_column(SQLAlchemyEnum(NodeLabel), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    meta_data: Mapped[str | None] = mapped_column(String, nullable=True)


class GraphEdgeModel(Base):
    __tablename__ = "graph_edges"

    source_id: Mapped[str] = mapped_column(ForeignKey("graph_nodes.id", ondelete="CASCADE"), primary_key=True)
    target_id: Mapped[str] = mapped_column(ForeignKey("graph_nodes.id", ondelete="CASCADE"), primary_key=True)
    type: Mapped[EdgeType] = mapped_column(SQLAlchemyEnum(EdgeType), primary_key=True)

class ProjectModel(Base):
    __tablename__ = "projects"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    last_opened: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class JarvisMemoryModel(Base):
    __tablename__ = "jarvis_memories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[UUID | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    memory_type: Mapped[str] = mapped_column(String(50), nullable=False) # e.g. "decision", "summary"
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False) # Text equivalent
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ContextSnippetModel(Base):
    __tablename__ = "context_snippets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[UUID | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False) # e.g. "dependency", "doc"
    content: Mapped[str] = mapped_column(String, nullable=False)
    # The actual vectors will be stored in a raw sqlite-vec virtual table `vec_context_snippets`
    # linked by rowid = ContextSnippetModel.id

