from __future__ import annotations

import hashlib
import json
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from backend.api.errors import ApiError
from backend.core.settings import get_settings
from backend.db.models import Message, Run, Thread
from backend.events.journal import append_run_created
from backend.model_control.service import runtime_snapshot


def normalize_question(value: str) -> str:
    normalized = value.strip()
    if not 1 <= len(normalized) <= 4000:
        raise ApiError("INVALID_REQUEST", "question 长度必须为 1–4000 个字符", 422)
    return normalized


def normalize_idempotency_key(value: str) -> str:
    normalized = value.strip()
    if not 1 <= len(normalized) <= 128:
        raise ApiError("INVALID_REQUEST", "idempotency_key 长度必须为 1–128 个字符", 422)
    return normalized


def request_hash(question: str, catalog_hash: str) -> str:
    encoded = json.dumps(
        {"schema_version": 1, "question": question, "catalog_hash": catalog_hash},
        ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def create_run(
    session: Session, *, thread_id: str, question: str, idempotency_key: str
) -> tuple[Run, bool]:
    normalized_question = normalize_question(question)
    normalized_key = normalize_idempotency_key(idempotency_key)
    if not get_settings().openai_api_key.get_secret_value():
        raise ApiError("MODEL_UNAVAILABLE", "Provider API Key 未配置", 503)
    with session.begin():
        thread = session.scalar(select(Thread).where(Thread.id == thread_id).with_for_update())
        if thread is None:
            raise ApiError("NOT_FOUND", "Thread 不存在", 404)
        if thread.status != "active":
            raise ApiError("THREAD_INACTIVE", "Thread 已归档", 409)
        snapshot = runtime_snapshot(session)
        catalog_hash = str(snapshot["catalog_hash"])
        digest = request_hash(normalized_question, catalog_hash)
        inserted_id = session.scalar(
            insert(Run)
            .values(
                id=f"run_{uuid4().hex}", thread_id=thread_id,
                question=normalized_question, idempotency_key=normalized_key,
                request_hash=digest, status="queued", config_snapshot=snapshot,
                retrieval_snapshot={"schema_version": 1, "version_ids": []},
                model_catalog_hash=catalog_hash, model_snapshot_json=snapshot,
                last_event_sequence=0,
            )
            .on_conflict_do_nothing(index_elements=[Run.thread_id, Run.idempotency_key])
            .returning(Run.id)
        )
        if inserted_id is None:
            existing = session.scalar(
                select(Run).where(Run.thread_id == thread_id, Run.idempotency_key == normalized_key)
            )
            if existing is None:
                raise RuntimeError("幂等冲突后未找到既有 Run")
            if existing.request_hash != digest:
                raise ApiError("IDEMPOTENCY_CONFLICT", "相同幂等键对应不同请求", 409)
            return existing, False
        run = session.get(Run, inserted_id)
        if run is None:
            raise RuntimeError("已登记的 Run 行不可读取")
        thread.last_sequence += 1
        thread.version += 1
        thread.message_count += 1
        session.add(Message(
            thread_id=thread_id, run_id=run.id, sequence=thread.last_sequence,
            role="user", status="completed", content=normalized_question,
        ))
        thread.last_sequence += 1
        thread.version += 1
        thread.message_count += 1
        session.add(Message(
            thread_id=thread_id, run_id=run.id, sequence=thread.last_sequence,
            role="assistant", status="streaming", content="",
        ))
        append_run_created(session, run)
        session.flush()
    return run, True


def list_runs(session: Session, *, offset: int, limit: int) -> tuple[list[Run], int]:
    total = session.scalar(select(func.count()).select_from(Run))
    items = list(session.scalars(
        select(Run).order_by(Run.created_at.desc(), Run.id.desc()).offset(offset).limit(limit)
    ))
    return items, int(total or 0)


def get_run(session: Session, *, run_id: str) -> Run:
    run = session.get(Run, run_id)
    if run is None:
        raise ApiError("NOT_FOUND", "Run 不存在", 404)
    return run
