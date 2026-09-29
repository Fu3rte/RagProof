from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from backend.schemas.common import ResponseSchema


class ThreadCreateRequest(ResponseSchema):
    title: str | None = Field(default=None, max_length=160)


class ThreadInfo(ResponseSchema):
    thread_id: str
    title: str
    updated_at: datetime
    message_count: int = Field(ge=0)
    version: int = Field(ge=0)
    thread_status: str
    active_run_id: str | None
    active_run_status: str | None


class ThreadResponse(ThreadInfo):
    created_at: datetime


class ThreadListResponse(ResponseSchema):
    threads: list[ThreadInfo]


class ThreadMessageInfo(ResponseSchema):
    id: int
    run_id: str | None
    sequence: int = Field(ge=1)
    status: str
    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: datetime
    rag_trace: dict[str, Any] | None


class ThreadMessagesResponse(ResponseSchema):
    messages: list[ThreadMessageInfo]
    previous_cursor: int | None


class ThreadDeleteResponse(ResponseSchema):
    thread_id: str
    message: str
