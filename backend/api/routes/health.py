from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from backend.api.dependencies import require_owner
from backend.api.errors import ApiError
from backend.schemas.common import HealthResponse, MeResponse, ReadyResponse


router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready", response_model=ReadyResponse)
def ready(request: Request) -> dict[str, str]:
    try:
        with request.app.state.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        raise ApiError("DATABASE_UNAVAILABLE", "数据库暂不可用", 503) from None
    return {"status": "ready", "database": "ready"}


@router.get("/me", response_model=MeResponse)
def me(owner_id: str = Depends(require_owner)) -> dict[str, str]:
    return {"owner_id": owner_id}
