from __future__ import annotations

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.errors import ApiError
from backend.db.models import Run, RunEvent


def append_run_created(session: Session, run: Run) -> RunEvent:
    run.last_event_sequence += 1
    event = RunEvent(
        event_id=f"evt_{uuid4().hex}",
        run_id=run.id,
        sequence=run.last_event_sequence,
        event_type="run.created",
        payload={"status": "queued"},
    )
    session.add(event)
    session.flush()
    return event


def read_run_events(
    session: Session,
    *,
    run_id: str,
    after: int,
    limit: int,
) -> list[RunEvent]:
    if session.get(Run, run_id) is None:
        raise ApiError("NOT_FOUND", "Run 不存在", 404)
    return list(
        session.scalars(
            select(RunEvent)
            .where(RunEvent.run_id == run_id, RunEvent.sequence > after)
            .order_by(RunEvent.sequence.asc())
            .limit(limit)
        )
    )
