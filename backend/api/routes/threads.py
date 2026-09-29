from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.infra.database import get_session
from backend.schemas.threads import (
    ThreadCreateRequest,
    ThreadDeleteResponse,
    ThreadListResponse,
    ThreadMessagesResponse,
    ThreadResponse,
)
from backend.threads.service import create_thread, delete_thread, list_threads, recent_messages


router = APIRouter(prefix="/v1/threads", tags=["threads"])


@router.post("", response_model=ThreadResponse, status_code=status.HTTP_201_CREATED)
def create(request: ThreadCreateRequest, session: Session = Depends(get_session)) -> dict:
    return create_thread(session, request.title)


@router.get("", response_model=ThreadListResponse)
def threads(session: Session = Depends(get_session)) -> dict:
    return list_threads(session)


@router.get("/{thread_id}/messages", response_model=ThreadMessagesResponse)
def messages(
    thread_id: str,
    before: int | None = Query(default=None, ge=1),
    limit: int = Query(default=200, ge=1, le=500),
    session: Session = Depends(get_session),
) -> dict:
    return recent_messages(session, thread_id, before, limit)


@router.delete("/{thread_id}", response_model=ThreadDeleteResponse)
def delete(thread_id: str, session: Session = Depends(get_session)) -> dict:
    return delete_thread(session, thread_id)
