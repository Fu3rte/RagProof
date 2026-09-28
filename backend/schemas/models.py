from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from backend.schemas.common import ResponseSchema


ModelRole = Literal["fast", "grader", "answer", "evaluator"]
CheckStatus = Literal["idle", "running", "succeeded", "failed"]


class TokenUsage(ResponseSchema):
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    total_tokens: int | None = Field(default=None, ge=0)


class ModelRoleConfiguration(ResponseSchema):
    role: ModelRole
    model_name: str
    purpose: str
    required_capability: str
    timeout_seconds: float = Field(gt=0, le=20)
    config_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")


class EmbeddingConfiguration(ResponseSchema):
    model_name: str
    dimension: int = Field(gt=0)
    timeout_seconds: float = Field(gt=0, le=20)
    required_capability: Literal["embedding_vector"]
    config_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")


class ModelCheckItem(ResponseSchema):
    role: Literal["fast", "grader", "answer", "evaluator", "embedding"]
    success: bool
    latency_ms: int = Field(ge=0)
    model_name: str
    capability: str
    usage: TokenUsage | None = None
    embedding_dimension: int | None = Field(default=None, ge=0)
    checked_at: datetime
    error_category: str | None = None


class LatestModelCheck(ResponseSchema):
    status: CheckStatus
    started_at: datetime | None = None
    finished_at: datetime | None = None
    total_latency_ms: int | None = Field(default=None, ge=0)
    config_fingerprint: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    items: list[ModelCheckItem] = Field(default_factory=list)


class ModelsResponse(ResponseSchema):
    roles: list[ModelRoleConfiguration]
    embedding: EmbeddingConfiguration
    config_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")
    latest_check: LatestModelCheck | None = None


class ModelCheckResponse(ResponseSchema):
    status: Literal["succeeded"]
    items: list[ModelCheckItem]
    started_at: datetime
    finished_at: datetime
    total_latency_ms: int = Field(ge=0)
    config_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")
