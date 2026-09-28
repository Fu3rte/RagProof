from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field, field_validator

from backend.schemas.common import ResponseSchema
from backend.schemas.retrieval import RetrievalSnapshot


class RunCreateRequest(ResponseSchema):
    question: str = Field(min_length=1, max_length=4000)
    idempotency_key: str = Field(min_length=1, max_length=128)

    @field_validator("question", mode="before")
    @classmethod
    def normalize_question(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("idempotency_key", mode="before")
    @classmethod
    def normalize_idempotency_key(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class RunResponse(ResponseSchema):
    id: str
    question: str
    status: str
    config_snapshot: dict[str, Any]
    retrieval_snapshot: RetrievalSnapshot
    created_at: datetime
    updated_at: datetime


class RunCreateResponse(ResponseSchema):
    created: bool
    run: RunResponse


class RunListResponse(ResponseSchema):
    items: list[RunResponse]
    offset: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class RunEventResponse(ResponseSchema):
    event_id: str
    run_id: str
    sequence: int = Field(gt=0)
    type: str
    timestamp: datetime
    data: dict[str, Any]


class RunEventPageResponse(ResponseSchema):
    items: list[RunEventResponse]
    after: int = Field(ge=0)
    next_after: int = Field(ge=0)
