from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base
from backend.infra.database import utcnow


class Thread(Base):
    __tablename__ = "threads"
    __table_args__ = (
        CheckConstraint("id ~ '^thread_[0-9a-f]{32}$'", name="ck_threads_id"),
        CheckConstraint("status IN ('active','archived')", name="ck_threads_status"),
        CheckConstraint("version >= 0 AND message_count >= 0 AND last_sequence >= 0", name="ck_threads_counters"),
        Index("ix_threads_updated_id", "updated_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    title: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), default=utcnow, onupdate=utcnow)


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (
        UniqueConstraint("thread_id", "idempotency_key", name="uq_runs_thread_idempotency"),
        CheckConstraint("length(question) BETWEEN 1 AND 4000", name="ck_runs_question_length"),
        CheckConstraint("length(idempotency_key) BETWEEN 1 AND 128", name="ck_runs_idempotency_length"),
        CheckConstraint("request_hash ~ '^[0-9a-f]{64}$'", name="ck_runs_request_hash"),
        CheckConstraint("jsonb_typeof(config_snapshot) = 'object'", name="ck_runs_snapshot_object"),
        CheckConstraint("jsonb_typeof(retrieval_snapshot) = 'object'", name="ck_runs_retrieval_snapshot_object"),
        CheckConstraint("model_catalog_hash ~ '^[0-9a-f]{64}$'", name="ck_runs_model_catalog_hash"),
        CheckConstraint("jsonb_typeof(model_snapshot_json) = 'object'", name="ck_runs_model_snapshot_object"),
        CheckConstraint("status IN ('queued','running','waiting_input','cancelling','succeeded','failed','cancelled')", name="ck_runs_status"),
        CheckConstraint("last_event_sequence >= 0", name="ck_runs_event_sequence_nonnegative"),
        Index("ix_runs_thread_created_id", "thread_id", "created_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    thread_id: Mapped[str] = mapped_column(String(120), ForeignKey("threads.id", ondelete="CASCADE"), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="queued")
    config_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    retrieval_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    # Run 创建时固定模型配置；后续状态更新只修改运行字段。
    model_catalog_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    model_snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    last_event_sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), default=utcnow, onupdate=utcnow)


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint("thread_id", "sequence", name="uq_messages_thread_sequence"),
        CheckConstraint("sequence > 0", name="ck_messages_sequence_positive"),
        CheckConstraint("role IN ('user','assistant','system')", name="ck_messages_role"),
        CheckConstraint("status IN ('streaming','completed','failed','cancelled','incomplete')", name="ck_messages_status"),
        CheckConstraint("rag_trace IS NULL OR jsonb_typeof(rag_trace) = 'object'", name="ck_messages_rag_trace_object"),
        Index("ix_messages_thread_sequence", "thread_id", "sequence"),
        Index("ix_messages_run_id", "run_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    thread_id: Mapped[str] = mapped_column(String(120), ForeignKey("threads.id", ondelete="CASCADE"), nullable=False)
    run_id: Mapped[str | None] = mapped_column(String(40), ForeignKey("runs.id", ondelete="SET NULL"))
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="completed")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    rag_trace: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), default=utcnow, onupdate=utcnow)


class RunEvent(Base):
    __tablename__ = "run_events"
    __table_args__ = (
        UniqueConstraint("event_id", name="uq_run_events_event_id"),
        UniqueConstraint("run_id", "sequence", name="uq_run_events_run_sequence"),
        CheckConstraint("sequence > 0", name="ck_run_events_sequence_positive"),
        CheckConstraint("schema_version >= 1", name="ck_run_events_schema_version"),
        CheckConstraint("jsonb_typeof(payload) = 'object'", name="ck_run_events_payload_object"),
        Index("ix_run_events_run_sequence", "run_id", "sequence"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(40), nullable=False)
    run_id: Mapped[str] = mapped_column(String(40), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), default=utcnow)


class ModelProfile(Base):
    __tablename__ = "model_profiles"
    __table_args__ = (
        UniqueConstraint("display_name", name="uq_model_profiles_display_name"),
        CheckConstraint("id ~ '^model_[0-9a-f]{32}$'", name="ck_model_profiles_id"),
        CheckConstraint("provider = 'openai'", name="ck_model_profiles_provider"),
        CheckConstraint("timeout_seconds > 0 AND timeout_seconds <= 600", name="ck_model_profiles_timeout"),
        CheckConstraint("version >= 1", name="ck_model_profiles_version"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model_name: Mapped[str] = mapped_column(String(160), nullable=False)
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)
    timeout_seconds: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    supports_stream: Mapped[bool] = mapped_column(Boolean, nullable=False)
    supports_structured_output: Mapped[bool] = mapped_column(Boolean, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), default=utcnow, onupdate=utcnow)


class ModelAssignment(Base):
    __tablename__ = "model_assignments"
    __table_args__ = (
        CheckConstraint("role IN ('answer','fast','grader')", name="ck_model_assignments_role"),
        Index("ix_model_assignments_profile_id", "profile_id"),
    )

    role: Mapped[str] = mapped_column(String(32), primary_key=True)
    profile_id: Mapped[str] = mapped_column(String(64), ForeignKey("model_profiles.id", ondelete="RESTRICT"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), default=utcnow, onupdate=utcnow)
