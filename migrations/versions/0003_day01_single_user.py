from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_day01_single_user"
down_revision = "0002_d2_documents_retrieval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("run_events")
    op.drop_table("chunks")
    op.drop_constraint("fk_documents_current_version_id", "documents", type_="foreignkey")
    op.drop_table("document_versions")
    op.drop_table("documents")
    op.drop_table("model_checks")
    op.drop_table("runs")

    op.create_table(
        "threads",
        sa.Column("id", sa.String(120), primary_key=True),
        sa.Column("title", sa.String(200)),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("message_count", sa.Integer(), nullable=False),
        sa.Column("last_sequence", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("id ~ '^thread_[0-9a-f]{32}$'", name="ck_threads_id"),
        sa.CheckConstraint("status IN ('active','archived')", name="ck_threads_status"),
        sa.CheckConstraint("version >= 0 AND message_count >= 0 AND last_sequence >= 0", name="ck_threads_counters"),
    )
    op.create_index("ix_threads_updated_id", "threads", ["updated_at", "id"])
    op.create_table(
        "runs",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("thread_id", sa.String(120), sa.ForeignKey("threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("config_snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("retrieval_snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("model_catalog_hash", sa.String(64), nullable=False),
        sa.Column("model_snapshot_json", postgresql.JSONB(), nullable=False),
        sa.Column("last_event_sequence", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("thread_id", "idempotency_key", name="uq_runs_thread_idempotency"),
        sa.CheckConstraint("length(question) BETWEEN 1 AND 4000", name="ck_runs_question_length"),
        sa.CheckConstraint("length(idempotency_key) BETWEEN 1 AND 128", name="ck_runs_idempotency_length"),
        sa.CheckConstraint("request_hash ~ '^[0-9a-f]{64}$'", name="ck_runs_request_hash"),
        sa.CheckConstraint("jsonb_typeof(config_snapshot) = 'object'", name="ck_runs_snapshot_object"),
        sa.CheckConstraint("jsonb_typeof(retrieval_snapshot) = 'object'", name="ck_runs_retrieval_snapshot_object"),
        sa.CheckConstraint("model_catalog_hash ~ '^[0-9a-f]{64}$'", name="ck_runs_model_catalog_hash"),
        sa.CheckConstraint("jsonb_typeof(model_snapshot_json) = 'object'", name="ck_runs_model_snapshot_object"),
        sa.CheckConstraint("status IN ('queued','running','waiting_input','cancelling','succeeded','failed','cancelled')", name="ck_runs_status"),
        sa.CheckConstraint("last_event_sequence >= 0", name="ck_runs_event_sequence_nonnegative"),
    )
    op.create_index("ix_runs_thread_created_id", "runs", ["thread_id", "created_at", "id"])
    op.create_table(
        "messages",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("thread_id", sa.String(120), sa.ForeignKey("threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("run_id", sa.String(40), sa.ForeignKey("runs.id", ondelete="SET NULL")),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("rag_trace", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("thread_id", "sequence", name="uq_messages_thread_sequence"),
        sa.CheckConstraint("sequence > 0", name="ck_messages_sequence_positive"),
        sa.CheckConstraint("role IN ('user','assistant','system')", name="ck_messages_role"),
        sa.CheckConstraint("status IN ('streaming','completed','failed','cancelled','incomplete')", name="ck_messages_status"),
        sa.CheckConstraint("rag_trace IS NULL OR jsonb_typeof(rag_trace) = 'object'", name="ck_messages_rag_trace_object"),
    )
    op.create_index("ix_messages_thread_sequence", "messages", ["thread_id", "sequence"])
    op.create_index("ix_messages_run_id", "messages", ["run_id"])
    op.create_table(
        "run_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.String(40), nullable=False),
        sa.Column("run_id", sa.String(40), sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("event_id", name="uq_run_events_event_id"),
        sa.UniqueConstraint("run_id", "sequence", name="uq_run_events_run_sequence"),
        sa.CheckConstraint("sequence > 0", name="ck_run_events_sequence_positive"),
        sa.CheckConstraint("schema_version >= 1", name="ck_run_events_schema_version"),
        sa.CheckConstraint("jsonb_typeof(payload) = 'object'", name="ck_run_events_payload_object"),
    )
    op.create_index("ix_run_events_run_sequence", "run_events", ["run_id", "sequence"])
    op.create_table(
        "model_profiles",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("model_name", sa.String(160), nullable=False),
        sa.Column("base_url", sa.String(512), nullable=False),
        sa.Column("timeout_seconds", sa.Numeric(10, 3), nullable=False),
        sa.Column("supports_stream", sa.Boolean(), nullable=False),
        sa.Column("supports_structured_output", sa.Boolean(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("display_name", name="uq_model_profiles_display_name"),
        sa.CheckConstraint("id ~ '^model_[0-9a-f]{32}$'", name="ck_model_profiles_id"),
        sa.CheckConstraint("provider = 'openai'", name="ck_model_profiles_provider"),
        sa.CheckConstraint("timeout_seconds > 0 AND timeout_seconds <= 600", name="ck_model_profiles_timeout"),
        sa.CheckConstraint("version >= 1", name="ck_model_profiles_version"),
    )
    op.create_table(
        "model_assignments",
        sa.Column("role", sa.String(32), primary_key=True),
        sa.Column("profile_id", sa.String(64), sa.ForeignKey("model_profiles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("role IN ('answer','fast','grader')", name="ck_model_assignments_role"),
    )
    op.create_index("ix_model_assignments_profile_id", "model_assignments", ["profile_id"])


def downgrade() -> None:
    raise RuntimeError("0003 irrevocably deletes legacy data; downgrade is unsupported")
