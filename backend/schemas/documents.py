from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator

from backend.schemas.common import ResponseSchema


_DOCUMENT_ID_PATTERN = r"^doc_[0-9a-f]{32}$"
_VERSION_ID_PATTERN = r"^ver_[0-9a-f]{32}$"
_CHUNK_ID_PATTERN = r"^chk_[0-9a-f]{32}$"
_ISO_DATE_PATTERN = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")


class DocumentCreateRequest(ResponseSchema):
    content: str = Field(min_length=1, max_length=50000)
    title: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=1, max_length=100)
    person_type: str = Field(min_length=1, max_length=100)
    effective_date: date

    @field_validator("content", mode="before")
    @classmethod
    def normalize_content(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        content = value.lstrip("\ufeff")
        if any(0xD800 <= ord(character) <= 0xDFFF for character in content):
            raise ValueError("content 包含非法 Unicode 字符")
        if not content.strip():
            raise ValueError("content 不能为空或仅包含空白字符")
        return content

    @field_validator("title", "topic", "region", "person_type", mode="before")
    @classmethod
    def normalize_metadata(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("effective_date", mode="before")
    @classmethod
    def require_iso_date(cls, value: object) -> object:
        if not isinstance(value, str) or _ISO_DATE_PATTERN.fullmatch(value) is None:
            raise ValueError("effective_date 必须使用 YYYY-MM-DD 格式")
        try:
            date.fromisoformat(value)
        except ValueError as error:
            raise ValueError("effective_date 必须是有效日期") from error
        return value


class DocumentVersionPublishRequest(DocumentCreateRequest):
    expected_current_version_id: str | None = Field(
        ..., pattern=_VERSION_ID_PATTERN
    )


class DocumentSummary(ResponseSchema):
    id: str = Field(pattern=_DOCUMENT_ID_PATTERN)
    title: str = Field(min_length=1, max_length=200)
    current_version_id: str | None = Field(default=None, pattern=_VERSION_ID_PATTERN)
    chunk_count: int = Field(ge=0, strict=True)
    topic: str | None = Field(default=None, min_length=1, max_length=100)
    region: str | None = Field(default=None, min_length=1, max_length=100)
    person_type: str | None = Field(default=None, min_length=1, max_length=100)
    effective_date: date | None = None
    published_at: datetime | None = None


class DocumentVersionSummary(ResponseSchema):
    id: str = Field(pattern=_VERSION_ID_PATTERN)
    version_number: int = Field(ge=1, strict=True)
    title: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=1, max_length=100)
    person_type: str = Field(min_length=1, max_length=100)
    effective_date: date
    chunk_count: int = Field(ge=0, strict=True)
    published_at: datetime


class DocumentCreateResponse(ResponseSchema):
    document: DocumentSummary
    version: DocumentVersionSummary


class DocumentVersionPublishResponse(ResponseSchema):
    created: bool
    published: bool
    document: DocumentSummary
    version: DocumentVersionSummary


class DocumentPageResponse(ResponseSchema):
    items: list[DocumentSummary]
    offset: int = Field(ge=0, strict=True)
    limit: int = Field(ge=1, le=100, strict=True)
    total: int = Field(ge=0, strict=True)


class DocumentVersionDetail(DocumentVersionSummary):
    content: str = Field(min_length=1, max_length=50000)
    content_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    metadata_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    build_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")
    chunk_size: Literal[600]
    chunk_overlap: Literal[80]
    embedding_model: str
    embedding_dimension: Literal[1024]
    embedding_config_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")


class DocumentVersionPageResponse(ResponseSchema):
    items: list[DocumentVersionSummary]
    offset: int = Field(ge=0, strict=True)
    limit: int = Field(ge=1, le=100, strict=True)
    total: int = Field(ge=0, strict=True)


class DocumentChunkResponse(ResponseSchema):
    id: str = Field(pattern=_CHUNK_ID_PATTERN)
    ordinal: int = Field(ge=0, strict=True)
    content: str = Field(min_length=1, max_length=600)
    character_count: int = Field(ge=0, strict=True)
    content_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class DocumentChunkPageResponse(ResponseSchema):
    items: list[DocumentChunkResponse]
    offset: int = Field(ge=0, strict=True)
    limit: int = Field(ge=1, le=100, strict=True)
    total: int = Field(ge=0, strict=True)
