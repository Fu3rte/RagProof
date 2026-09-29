from __future__ import annotations

from uuid import uuid4

from sqlalchemy import case, select
from sqlalchemy.orm import Session, aliased

from backend.api.errors import ApiError
from backend.db.models import Message, Run, Thread
from backend.infra.database import utcnow


_TERMINAL = ("succeeded", "failed", "cancelled")


def _summary(row: Thread, active_run_id: str | None, active_run_status: str | None) -> dict:
    return {
        "thread_id": row.id,
        "title": row.title or row.id,
        "updated_at": row.updated_at,
        "message_count": row.message_count,
        "version": row.version,
        "thread_status": row.status,
        "active_run_id": active_run_id,
        "active_run_status": active_run_status,
    }


def create_thread(session: Session, title: str | None) -> dict:
    normalized = " ".join(title.split()) if title is not None else ""
    if len(normalized) > 160:
        raise ApiError("INVALID_REQUEST", "Thread 标题过长", 422)
    with session.begin():
        row = Thread(id=f"thread_{uuid4().hex}", title=normalized or None)
        session.add(row)
        session.flush()
    return _summary(row, None, None) | {"created_at": row.created_at}


def list_threads(session: Session) -> dict:
    active = aliased(Run)
    priority = case(
        (active.status == "running", 0),
        (active.status == "waiting_input", 1),
        (active.status == "cancelling", 2),
        (active.status == "queued", 3),
        else_=4,
    )
    selected_id = (
        select(active.id)
        .where(active.thread_id == Thread.id, active.status.not_in(_TERMINAL))
        .order_by(priority, active.created_at, active.id)
        .limit(1)
        .correlate(Thread)
        .scalar_subquery()
    )
    rows = session.execute(
        select(Thread, Run.id, Run.status)
        .outerjoin(Run, Run.id == selected_id)
        .order_by(Thread.updated_at.desc(), Thread.id.desc())
    ).all()
    return {"threads": [_summary(row, run_id, status) for row, run_id, status in rows]}


def _require_thread(session: Session, thread_id: str, *, lock: bool = False) -> Thread:
    query = select(Thread).where(Thread.id == thread_id)
    row = session.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise ApiError("NOT_FOUND", "Thread 不存在", 404)
    return row


def recent_messages(session: Session, thread_id: str, before: int | None, limit: int) -> dict:
    _require_thread(session, thread_id)
    query = select(Message).where(Message.thread_id == thread_id)
    if before is not None:
        query = query.where(Message.sequence < before)
    rows = session.scalars(query.order_by(Message.sequence.desc()).limit(limit + 1)).all()
    selected = list(reversed(rows[:limit]))
    return {
        "messages": [
            {
                "id": item.id,
                "run_id": item.run_id,
                "sequence": item.sequence,
                "status": item.status,
                "role": item.role,
                "content": item.content,
                "timestamp": item.created_at,
                "rag_trace": item.rag_trace,
            }
            for item in selected
        ],
        "previous_cursor": selected[0].sequence if len(rows) > limit else None,
    }


def delete_thread(session: Session, thread_id: str) -> dict:
    with session.begin():
        row = _require_thread(session, thread_id, lock=True)
        active = session.execute(
            select(Run.id, Run.status)
            .where(Run.thread_id == thread_id, Run.status.not_in(_TERMINAL))
            .order_by(Run.created_at, Run.id)
            .limit(1)
        ).first()
        if active is not None:
            raise ApiError("RUN_ACTIVE", "Thread 仍有活跃 Run", 409, {"active_run_id": active.id, "active_run_status": active.status})
        session.delete(row)
    return {"thread_id": thread_id, "message": "成功删除 Thread"}
