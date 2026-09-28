from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from pydantic import Field, FiniteFloat, field_validator

from backend.schemas.common import ResponseSchema


VersionId = Annotated[str, Field(pattern=r"^ver_[0-9a-f]{32}$")]


class RetrievalSnapshot(ResponseSchema):
    schema_version: Literal[1]
    version_ids: list[VersionId]


class RetrievalPreviewRequest(ResponseSchema):
    query: str = Field(min_length=1, max_length=4000)
    top_k: int = Field(default=6, ge=1, le=20, strict=True)

    @field_validator("query", mode="before")
    @classmethod
    def normalize_query(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class RetrievalPreviewItem(ResponseSchema):
    rank: int = Field(ge=1, strict=True)
    chunk_id: str = Field(pattern=r"^chk_[0-9a-f]{32}$")
    document_id: str = Field(pattern=r"^doc_[0-9a-f]{32}$")
    document_version_id: str = Field(pattern=r"^ver_[0-9a-f]{32}$")
    ordinal: int = Field(ge=0, strict=True)
    content: str
    distance: FiniteFloat
    title: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=1, max_length=100)
    person_type: str = Field(min_length=1, max_length=100)
    effective_date: date


class RetrievalPreviewResponse(ResponseSchema):
    snapshot: RetrievalSnapshot
    query: str = Field(min_length=1, max_length=4000)
    top_k: int = Field(ge=1, le=20, strict=True)
    duration_ms: int = Field(ge=0, strict=True)
    items: list[RetrievalPreviewItem]
