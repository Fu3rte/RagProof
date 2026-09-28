from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from backend.api.dependencies import require_owner
from backend.core.settings import Settings, get_settings
from backend.db.models import Run
from backend.events.journal import read_run_events
from backend.infra.database import get_session
from backend.runs.service import create_run, get_run, list_runs
from backend.schemas.runs import (
    RunCreateRequest,
    RunCreateResponse,
    RunEventPageResponse,
    RunListResponse,
    RunResponse,
)


router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.post("", response_model=RunCreateResponse)
def create(
    body: RunCreateRequest,
    response: Response,
    owner_id: str = Depends(require_owner),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> dict:
    run, created = create_run(
        session,
        owner_id=owner_id,
        question=body.question,
        idempotency_key=body.idempotency_key,
        settings=settings,
    )
    response.status_code = 201 if created else 200
    return {"created": created, "run": run}


@router.get("", response_model=RunListResponse)
def runs(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    owner_id: str = Depends(require_owner),
    session: Session = Depends(get_session),
) -> dict:
    items, total = list_runs(session, owner_id=owner_id, offset=offset, limit=limit)
    return {"items": items, "offset": offset, "limit": limit, "total": total}


@router.get("/{run_id}/events", response_model=RunEventPageResponse)
def events(
    run_id: str,
    after: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
    owner_id: str = Depends(require_owner),
    session: Session = Depends(get_session),
) -> dict:
    items = read_run_events(
        session,
        owner_id=owner_id,
        run_id=run_id,
        after=after,
        limit=limit,
    )
    return {
        "items": [
            {
                "event_id": item.event_id,
                "run_id": item.run_id,
                "sequence": item.sequence,
                "type": item.event_type,
                "timestamp": item.created_at,
                "data": item.payload,
            }
            for item in items
        ],
        "after": after,
        "next_after": items[-1].sequence if items else after,
    }


@router.get("/{run_id}", response_model=RunResponse)
def run(
    run_id: str,
    owner_id: str = Depends(require_owner),
    session: Session = Depends(get_session),
) -> Run:
    return get_run(session, owner_id=owner_id, run_id=run_id)
