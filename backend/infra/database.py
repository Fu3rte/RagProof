from __future__ import annotations

from collections.abc import Generator
from datetime import UTC, datetime

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.core.settings import get_settings


settings = get_settings()
engine = create_engine(
    settings.database_url.get_secret_value(),
    pool_pre_ping=True,
)


def utcnow() -> datetime:
    return datetime.now(UTC)


def get_session(request: Request) -> Generator[Session, None, None]:
    session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()
