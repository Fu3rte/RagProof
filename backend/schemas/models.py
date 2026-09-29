from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from backend.schemas.common import ResponseSchema


class ModelProfileRequest(ResponseSchema):
    display_name: str = Field(min_length=1, max_length=120)
    provider: Literal["openai"] = "openai"
    model_name: str = Field(min_length=1, max_length=160)
    base_url: str = Field(default="", max_length=512)
    timeout_seconds: float = Field(default=30, gt=0, le=600, allow_inf_nan=False)
    supports_stream: bool = True
    supports_structured_output: bool = True
    enabled: bool = True


class ModelAssignmentRequest(ResponseSchema):
    profile_id: str = Field(pattern=r"^model_[0-9a-f]{32}$")


class ModelProfileResponse(ModelProfileRequest):
    id: str
    version: int = Field(ge=1)
    created_at: datetime
    updated_at: datetime


class ModelRoleRequirement(ResponseSchema):
    supports_stream: bool
    supports_structured_output: bool


class ModelControlPlaneResponse(ResponseSchema):
    schema_version: Literal[1]
    provider_secret_configured: bool
    catalog_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    profiles: list[ModelProfileResponse]
    assignments: dict[str, ModelProfileResponse | None]
    requirements: dict[str, ModelRoleRequirement]


class ModelDeleteResponse(ResponseSchema):
    profile_id: str
    deleted: bool
