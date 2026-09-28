from __future__ import annotations

import hashlib
import json
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from backend.api.errors import ApiError
from backend.core.settings import Settings
from backend.db.models import Run
from backend.events.journal import append_run_created
from backend.model_control.contracts import run_config_snapshot


def reserve_run(
    session: Session,
    *,
    owner_id: str,
    question: str,
    idempotency_key: str,
    request_hash: str,
    config_snapshot: dict[str, object],
) -> tuple[Run, bool]:
    run_id = f"run_{uuid4().hex}"
    statement = (
        insert(Run)
        .values(
            id=run_id,
            owner_id=owner_id,
            question=question,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            status="queued",
            config_snapshot=config_snapshot,
            last_event_sequence=0,
        )
        .on_conflict_do_nothing(index_elements=[Run.owner_id, Run.idempotency_key])
        .returning(Run.id)
    )
    inserted_id = session.scalar(statement)
    if inserted_id is not None:
        run = session.scalar(select(Run).where(Run.id == inserted_id).with_for_update())
        if run is None:
            raise RuntimeError("已登记的 Run 行不可读取")
        return run, True

    existing = session.scalar(
        select(Run)
        .where(Run.owner_id == owner_id, Run.idempotency_key == idempotency_key)
        .with_for_update()
    )
    if existing is None:
        raise RuntimeError("幂等冲突后未找到既有 Run")
    if existing.request_hash != request_hash:
        raise ApiError(
            "IDEMPOTENCY_CONFLICT",
            "相同幂等键对应不同请求",
            409,
        )
    return existing, False


def normalize_question(value: str) -> str:
    normalized = value.strip()
    if not 1 <= len(normalized) <= 4000:
        raise ApiError("INVALID_REQUEST", "question 长度必须为 1–4000 个字符", 422)
    return normalized


def normalize_idempotency_key(value: str) -> str:
    normalized = value.strip()
    if not 1 <= len(normalized) <= 128:
        raise ApiError(
            "INVALID_REQUEST", "idempotency_key 长度必须为 1–128 个字符", 422
        )
    return normalized


def request_hash(question: str, config_fingerprint: str) -> str:
    payload = {
        "schema_version": 1,
        "question": question,
        "config_fingerprint": config_fingerprint,
    }
    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def create_run(
    session: Session,
    *,
    owner_id: str,
    question: str,
    idempotency_key: str,
    settings: Settings,
) -> tuple[Run, bool]:
    normalized_question = normalize_question(question)
    normalized_key = normalize_idempotency_key(idempotency_key)
    snapshot = run_config_snapshot(settings)
    fingerprint = str(snapshot["config_fingerprint"])
    digest = request_hash(normalized_question, fingerprint)
    with session.begin():
        run, created = reserve_run(
            session,
            owner_id=owner_id,
            question=normalized_question,
            idempotency_key=normalized_key,
            request_hash=digest,
            config_snapshot=snapshot,
        )
        if created:
            append_run_created(session, run)
        session.flush()
    return run, created


def list_runs(
    session: Session, *, owner_id: str, offset: int, limit: int
) -> tuple[list[Run], int]:
    total = session.scalar(
        select(func.count()).select_from(Run).where(Run.owner_id == owner_id)
    )
    items = list(
        session.scalars(
            select(Run)
            .where(Run.owner_id == owner_id)
            .order_by(Run.created_at.desc(), Run.id.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    return items, int(total or 0)


def get_run(session: Session, *, owner_id: str, run_id: str) -> Run:
    run = session.scalar(select(Run).where(Run.owner_id == owner_id, Run.id == run_id))
    if run is None:
        raise ApiError("NOT_FOUND", "Run 不存在", 404)
    return run
