from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from backend.infra.database import get_session
from backend.model_control.service import assign_role, control_plane, create_profile, delete_profile, update_profile
from backend.schemas.models import ModelAssignmentRequest, ModelControlPlaneResponse, ModelDeleteResponse, ModelProfileRequest


router = APIRouter(prefix="/v1/models", tags=["models"])


@router.get("", response_model=ModelControlPlaneResponse)
def models(session: Session = Depends(get_session)) -> dict:
    return control_plane(session)


@router.post("", response_model=ModelControlPlaneResponse, status_code=status.HTTP_201_CREATED)
def create_model(request: ModelProfileRequest, session: Session = Depends(get_session)) -> dict:
    return create_profile(session, request.model_dump())


@router.put("/assignments/{role}", response_model=ModelControlPlaneResponse)
def assign_model(role: Literal["answer", "fast", "grader"], request: ModelAssignmentRequest, session: Session = Depends(get_session)) -> dict:
    return assign_role(session, role, request.profile_id)


@router.put("/{profile_id}", response_model=ModelControlPlaneResponse)
def update_model(profile_id: str, request: ModelProfileRequest, session: Session = Depends(get_session)) -> dict:
    return update_profile(session, profile_id, request.model_dump())


@router.delete("/{profile_id}", response_model=ModelDeleteResponse)
def delete_model(profile_id: str, session: Session = Depends(get_session)) -> dict:
    return delete_profile(session, profile_id)
