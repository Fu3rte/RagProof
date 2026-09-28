from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.dependencies import require_owner
from backend.core.settings import Settings, get_settings
from backend.infra.database import get_session
from backend.model_control.service import list_models, run_model_check
from backend.schemas.models import ModelCheckResponse, ModelsResponse


router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("", response_model=ModelsResponse)
def models(
    owner_id: str = Depends(require_owner),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> dict:
    return list_models(session, owner_id=owner_id, settings=settings)


@router.post("/check", response_model=ModelCheckResponse)
def check_models(
    owner_id: str = Depends(require_owner),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> dict:
    return run_model_check(session, owner_id=owner_id, settings=settings)
