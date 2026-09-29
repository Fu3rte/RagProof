from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ResponseSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class HealthResponse(ResponseSchema):
    status: str


class ReadyResponse(ResponseSchema):
    status: str
    database: str
