from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql


revision = "0002_d2_documents_retrieval"
down_revision = "0001_d1_persistence"
branch_labels = None
depends_on = None


_EMPTY_RETRIEVAL_SNAPSHOT = sa.text(
    "'{\"schema_version\": 1, \"version_ids\": []}'::jsonb"
)


def upgrade() -> None:
    op.add_column(
        "runs",
        sa.Column(
            "retrieval_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.execute(
        "UPDATE runs SET retrieval_snapshot = "
        "'{\"schema_version\": 1, \"version_ids\": []}'::jsonb "
        "WHERE retrieval_snapshot IS NULL"
    )
    op.alter_column(
        "runs",
        "retrieval_snapshot",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        nullable=False,
        server_default=_EMPTY_RETRIEVAL_SNAPSHOT,
    )
    op.create_check_constraint(
        "ck_runs_retrieval_snapshot_object",
        "runs",
        "jsonb_typeof(retrieval_snapshot) = 'object'",
    )

    op.create_table(
        "documents",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("owner_id", sa.String(length=128), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("current_version_id", sa.String(length=36), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("id ~ '^doc_[0-9a-f]{32}$'", name="ck_documents_id"),
        sa.CheckConstraint("length(owner_id) > 0", name="ck_documents_owner_nonempty"),
        sa.CheckConstraint(
            "length(title) BETWEEN 1 AND 200 AND title = btrim(title)",
            name="ck_documents_title_length",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_documents_owner_updated_id",
        "documents",
        ["owner_id", "updated_at", "id"],
        unique=False,
    )

    op.create_table(
        "document_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=False),
        sa.Column("owner_id", sa.String(length=128), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("topic", sa.String(length=100), nullable=False),
        sa.Column("region", sa.String(length=100), nullable=False),
        sa.Column("person_type", sa.String(length=100), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("metadata_sha256", sa.String(length=64), nullable=False),
        sa.Column("build_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("chunk_size", sa.Integer(), nullable=False),
        sa.Column("chunk_overlap", sa.Integer(), nullable=False),
        sa.Column("embedding_model", sa.Text(), nullable=False),
        sa.Column("embedding_dimension", sa.Integer(), nullable=False),
        sa.Column(
            "embedding_config_fingerprint", sa.String(length=64), nullable=False
        ),
        sa.Column("chunk_count", sa.Integer(), nullable=False),
        sa.Column(
            "published_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "id ~ '^ver_[0-9a-f]{32}$'", name="ck_document_versions_id"
        ),
        sa.CheckConstraint(
            "length(owner_id) > 0", name="ck_document_versions_owner_nonempty"
        ),
        sa.CheckConstraint("version_number > 0", name="ck_document_versions_number"),
        sa.CheckConstraint(
            "length(content) BETWEEN 1 AND 50000",
            name="ck_document_versions_content_length",
        ),
        sa.CheckConstraint(
            "length(title) BETWEEN 1 AND 200 AND title = btrim(title)",
            name="ck_document_versions_title_length",
        ),
        sa.CheckConstraint(
            "length(topic) BETWEEN 1 AND 100 AND topic = btrim(topic)",
            name="ck_document_versions_topic_length",
        ),
        sa.CheckConstraint(
            "length(region) BETWEEN 1 AND 100 AND region = btrim(region)",
            name="ck_document_versions_region_length",
        ),
        sa.CheckConstraint(
            "length(person_type) BETWEEN 1 AND 100 AND person_type = btrim(person_type)",
            name="ck_document_versions_person_type_length",
        ),
        sa.CheckConstraint(
            "content_sha256 ~ '^[0-9a-f]{64}$'",
            name="ck_document_versions_content_sha256",
        ),
        sa.CheckConstraint(
            "metadata_sha256 ~ '^[0-9a-f]{64}$'",
            name="ck_document_versions_metadata_sha256",
        ),
        sa.CheckConstraint(
            "build_fingerprint ~ '^[0-9a-f]{64}$'",
            name="ck_document_versions_build_fingerprint",
        ),
        sa.CheckConstraint("chunk_size = 600", name="ck_document_versions_chunk_size"),
        sa.CheckConstraint(
            "chunk_overlap = 80", name="ck_document_versions_chunk_overlap"
        ),
        sa.CheckConstraint(
            "embedding_dimension = 1024",
            name="ck_document_versions_embedding_dimension",
        ),
        sa.CheckConstraint(
            "embedding_config_fingerprint ~ '^[0-9a-f]{64}$'",
            name="ck_document_versions_embedding_config_fingerprint",
        ),
        sa.CheckConstraint("chunk_count >= 0", name="ck_document_versions_chunk_count"),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            name="fk_document_versions_document_id",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "document_id", "version_number", name="uq_document_versions_number"
        ),
        sa.UniqueConstraint(
            "document_id", "build_fingerprint", name="uq_document_versions_build"
        ),
    )
    op.create_index(
        "ix_document_versions_owner_document_published",
        "document_versions",
        ["owner_id", "document_id", "published_at", "id"],
        unique=False,
    )

    op.create_table(
        "chunks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("owner_id", sa.String(length=128), nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=False),
        sa.Column("document_version_id", sa.String(length=36), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("character_count", sa.Integer(), nullable=False),
        sa.Column("embedding", Vector(1024), nullable=False),
        sa.CheckConstraint("id ~ '^chk_[0-9a-f]{32}$'", name="ck_chunks_id"),
        sa.CheckConstraint("length(owner_id) > 0", name="ck_chunks_owner_nonempty"),
        sa.CheckConstraint("ordinal >= 0", name="ck_chunks_ordinal"),
        sa.CheckConstraint("character_count >= 0", name="ck_chunks_character_count"),
        sa.CheckConstraint(
            "content_sha256 ~ '^[0-9a-f]{64}$'", name="ck_chunks_content_sha256"
        ),
        sa.ForeignKeyConstraint(
            ["document_id"], ["documents.id"], name="fk_chunks_document_id"
        ),
        sa.ForeignKeyConstraint(
            ["document_version_id"],
            ["document_versions.id"],
            name="fk_chunks_document_version_id",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "document_version_id", "ordinal", name="uq_chunks_version_ordinal"
        ),
    )
    op.create_index(
        "ix_chunks_owner_version",
        "chunks",
        ["owner_id", "document_version_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_documents_current_version_id",
        "documents",
        "document_versions",
        ["current_version_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_documents_current_version_id", "documents", type_="foreignkey"
    )
    op.drop_index("ix_chunks_owner_version", table_name="chunks")
    op.drop_table("chunks")
    op.drop_index(
        "ix_document_versions_owner_document_published",
        table_name="document_versions",
    )
    op.drop_table("document_versions")
    op.drop_index("ix_documents_owner_updated_id", table_name="documents")
    op.drop_table("documents")
    op.drop_constraint(
        "ck_runs_retrieval_snapshot_object", "runs", type_="check"
    )
    op.drop_column("runs", "retrieval_snapshot")
