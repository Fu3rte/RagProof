from __future__ import annotations

from fastapi import APIRouter, Request
from sqlalchemy import text

from backend.schemas.common import HealthResponse, ReadyResponse


router = APIRouter(prefix="/v1", tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready", response_model=ReadyResponse)
def ready(request: Request) -> dict[str, str]:
    with request.app.state.engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ready", "database": "ready"}
