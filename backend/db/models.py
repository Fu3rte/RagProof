from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base
from backend.infra.database import utcnow


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (
        UniqueConstraint(
            "owner_id", "idempotency_key", name="uq_runs_owner_idempotency"
        ),
        CheckConstraint("length(owner_id) > 0", name="ck_runs_owner_nonempty"),
        CheckConstraint(
            "length(question) BETWEEN 1 AND 4000", name="ck_runs_question_length"
        ),
        CheckConstraint(
            "length(idempotency_key) BETWEEN 1 AND 128",
            name="ck_runs_idempotency_length",
        ),
        CheckConstraint("request_hash ~ '^[0-9a-f]{64}$'", name="ck_runs_request_hash"),
        CheckConstraint(
            "jsonb_typeof(config_snapshot) = 'object'", name="ck_runs_snapshot_object"
        ),
        CheckConstraint(
            "jsonb_typeof(retrieval_snapshot) = 'object'",
            name="ck_runs_retrieval_snapshot_object",
        ),
        CheckConstraint(
            "status IN ('queued','running','waiting_input','cancelling','succeeded','failed','cancelled')",
            name="ck_runs_status",
        ),
        CheckConstraint(
            "last_event_sequence >= 0", name="ck_runs_event_sequence_nonnegative"
        ),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="queued")
    config_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    retrieval_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: {"schema_version": 1, "version_ids": []},
        server_default='{"schema_version": 1, "version_ids": []}',
    )
    last_event_sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=utcnow,
        onupdate=utcnow,
    )


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint("id ~ '^doc_[0-9a-f]{32}$'", name="ck_documents_id"),
        CheckConstraint("length(owner_id) > 0", name="ck_documents_owner_nonempty"),
        CheckConstraint(
            "length(title) BETWEEN 1 AND 200 AND title = btrim(title)",
            name="ck_documents_title_length",
        ),
        Index("ix_documents_owner_updated_id", "owner_id", "updated_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(128), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    current_version_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey(
            "document_versions.id",
            name="fk_documents_current_version_id",
            use_alter=True,
        ),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=utcnow,
        onupdate=utcnow,
    )


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (
        UniqueConstraint(
            "document_id", "version_number", name="uq_document_versions_number"
        ),
        UniqueConstraint(
            "document_id", "build_fingerprint", name="uq_document_versions_build"
        ),
        CheckConstraint("id ~ '^ver_[0-9a-f]{32}$'", name="ck_document_versions_id"),
        CheckConstraint(
            "length(owner_id) > 0", name="ck_document_versions_owner_nonempty"
        ),
        CheckConstraint("version_number > 0", name="ck_document_versions_number"),
        CheckConstraint(
            "length(content) BETWEEN 1 AND 50000",
            name="ck_document_versions_content_length",
        ),
        CheckConstraint(
            "length(title) BETWEEN 1 AND 200 AND title = btrim(title)",
            name="ck_document_versions_title_length",
        ),
        CheckConstraint(
            "length(topic) BETWEEN 1 AND 100 AND topic = btrim(topic)",
            name="ck_document_versions_topic_length",
        ),
        CheckConstraint(
            "length(region) BETWEEN 1 AND 100 AND region = btrim(region)",
            name="ck_document_versions_region_length",
        ),
        CheckConstraint(
            "length(person_type) BETWEEN 1 AND 100 AND person_type = btrim(person_type)",
            name="ck_document_versions_person_type_length",
        ),
        CheckConstraint(
            "content_sha256 ~ '^[0-9a-f]{64}$'",
            name="ck_document_versions_content_sha256",
        ),
        CheckConstraint(
            "metadata_sha256 ~ '^[0-9a-f]{64}$'",
            name="ck_document_versions_metadata_sha256",
        ),
        CheckConstraint(
            "build_fingerprint ~ '^[0-9a-f]{64}$'",
            name="ck_document_versions_build_fingerprint",
        ),
        CheckConstraint("chunk_size = 600", name="ck_document_versions_chunk_size"),
        CheckConstraint(
            "chunk_overlap = 80", name="ck_document_versions_chunk_overlap"
        ),
        CheckConstraint(
            "embedding_dimension = 1024",
            name="ck_document_versions_embedding_dimension",
        ),
        CheckConstraint(
            "embedding_config_fingerprint ~ '^[0-9a-f]{64}$'",
            name="ck_document_versions_embedding_config_fingerprint",
        ),
        CheckConstraint("chunk_count >= 0", name="ck_document_versions_chunk_count"),
        Index(
            "ix_document_versions_owner_document_published",
            "owner_id",
            "document_id",
            "published_at",
            "id",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("documents.id", name="fk_document_versions_document_id"),
        nullable=False,
    )
    owner_id: Mapped[str] = mapped_column(String(128), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    topic: Mapped[str] = mapped_column(String(100), nullable=False)
    region: Mapped[str] = mapped_column(String(100), nullable=False)
    person_type: Mapped[str] = mapped_column(String(100), nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    metadata_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    build_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    chunk_size: Mapped[int] = mapped_column(Integer, nullable=False, default=600)
    chunk_overlap: Mapped[int] = mapped_column(Integer, nullable=False, default=80)
    embedding_model: Mapped[str] = mapped_column(Text, nullable=False)
    embedding_dimension: Mapped[int] = mapped_column(Integer, nullable=False, default=1024)
    embedding_config_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Chunk(Base):
    __tablename__ = "chunks"
    __table_args__ = (
        UniqueConstraint(
            "document_version_id", "ordinal", name="uq_chunks_version_ordinal"
        ),
        CheckConstraint("id ~ '^chk_[0-9a-f]{32}$'", name="ck_chunks_id"),
        CheckConstraint("length(owner_id) > 0", name="ck_chunks_owner_nonempty"),
        CheckConstraint("ordinal >= 0", name="ck_chunks_ordinal"),
        CheckConstraint("character_count >= 0", name="ck_chunks_character_count"),
        CheckConstraint(
            "content_sha256 ~ '^[0-9a-f]{64}$'", name="ck_chunks_content_sha256"
        ),
        Index("ix_chunks_owner_version", "owner_id", "document_version_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(128), nullable=False)
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("documents.id", name="fk_chunks_document_id"),
        nullable=False,
    )
    document_version_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("document_versions.id", name="fk_chunks_document_version_id"),
        nullable=False,
    )
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    character_count: Mapped[int] = mapped_column(Integer, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(1024), nullable=False)


class RunEvent(Base):
    __tablename__ = "run_events"
    __table_args__ = (
        UniqueConstraint("event_id", name="uq_run_events_event_id"),
        UniqueConstraint("run_id", "sequence", name="uq_run_events_run_sequence"),
        CheckConstraint("sequence > 0", name="ck_run_events_sequence_positive"),
        CheckConstraint(
            "jsonb_typeof(payload) = 'object'", name="ck_run_events_payload_object"
        ),
        Index("ix_run_events_run_sequence", "run_id", "sequence"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(40), nullable=False)
    run_id: Mapped[str] = mapped_column(
        ForeignKey("runs.id", ondelete="CASCADE"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=utcnow,
    )


class ModelCheck(Base):
    __tablename__ = "model_checks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('idle','running','succeeded','failed')",
            name="ck_model_checks_status",
        ),
    )

    owner_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="idle")
    lease_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=utcnow,
        onupdate=utcnow,
    )
