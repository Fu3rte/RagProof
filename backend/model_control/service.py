from __future__ import annotations

from decimal import Decimal
from urllib.parse import urlsplit
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.errors import ApiError
from backend.core.settings import get_settings
from backend.db.models import ModelAssignment, ModelProfile
from backend.infra.database import utcnow
from backend.model_control.contracts import MODEL_ROLE_REQUIREMENTS, model_catalog_snapshot


def _profile(row: ModelProfile) -> dict:
    return {
        "id": row.id,
        "display_name": row.display_name,
        "provider": row.provider,
        "model_name": row.model_name,
        "base_url": row.base_url,
        "timeout_seconds": float(row.timeout_seconds),
        "supports_stream": row.supports_stream,
        "supports_structured_output": row.supports_structured_output,
        "enabled": row.enabled,
        "version": row.version,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _runtime(row: ModelProfile) -> dict:
    return {
        key: value
        for key, value in _profile(row).items()
        if key not in {"id", "enabled", "version", "created_at", "updated_at"}
    } | {"profile_id": row.id, "profile_version": row.version}


def _validate_url(value: str) -> str:
    value = value.strip().rstrip("/")
    if value:
        parsed = urlsplit(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            raise ApiError("INVALID_REQUEST", "Base URL 必须是不含凭据的 HTTP/HTTPS 地址", 422)
        parsed.port
    return value


def _require_compatible(row: ModelProfile, role: str) -> None:
    if not row.enabled or not getattr(row, MODEL_ROLE_REQUIREMENTS[role]):
        raise ApiError("MODEL_CAPABILITY_MISMATCH", f"{role} 角色要求已启用且满足模型能力", 409)


def _get_profile(session: Session, profile_id: str, *, lock: bool = False) -> ModelProfile:
    query = select(ModelProfile).where(ModelProfile.id == profile_id)
    row = session.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise ApiError("NOT_FOUND", "Model Profile 不存在", 404)
    return row


def control_plane(session: Session) -> dict:
    profiles = session.scalars(select(ModelProfile).order_by(ModelProfile.display_name, ModelProfile.id)).all()
    assignments = dict(session.execute(select(ModelAssignment.role, ModelAssignment.profile_id)).all())
    indexed = {row.id: row for row in profiles}
    snapshot = model_catalog_snapshot({role: _runtime(indexed[profile_id]) for role, profile_id in assignments.items()})
    return {
        "schema_version": 1,
        "provider_secret_configured": bool(get_settings().openai_api_key.get_secret_value()),
        "catalog_hash": snapshot["catalog_hash"],
        "profiles": [_profile(row) for row in profiles],
        "assignments": {role: _profile(indexed[assignments[role]]) if role in assignments else None for role in MODEL_ROLE_REQUIREMENTS},
        "requirements": {role: {"supports_stream": capability == "supports_stream", "supports_structured_output": capability == "supports_structured_output"} for role, capability in MODEL_ROLE_REQUIREMENTS.items()},
    }


def runtime_snapshot(session: Session) -> dict:
    rows = session.execute(select(ModelAssignment.role, ModelProfile).join(ModelProfile, ModelAssignment.profile_id == ModelProfile.id)).all()
    assigned = {role: row for role, row in rows}
    missing = sorted(set(MODEL_ROLE_REQUIREMENTS) - set(assigned))
    if missing:
        raise ApiError("MODEL_UNAVAILABLE", "必需模型角色尚未配置", 503, {"missing_roles": missing})
    for role, row in assigned.items():
        _require_compatible(row, role)
    return model_catalog_snapshot({role: _runtime(row) for role, row in assigned.items()})


def _apply(row: ModelProfile, values: dict) -> None:
    for key, value in values.items():
        if key == "base_url":
            value = _validate_url(value)
        if key == "timeout_seconds":
            value = Decimal(str(value))
        if key in {"display_name", "model_name"}:
            value = value.strip()
            if not value or any(ord(character) < 32 for character in value):
                raise ApiError("INVALID_REQUEST", f"{key} 无效", 422)
        setattr(row, key, value)


def create_profile(session: Session, values: dict) -> dict:
    with session.begin():
        row = ModelProfile(id=f"model_{uuid4().hex}", version=1, created_at=utcnow(), updated_at=utcnow())
        _apply(row, values)
        session.add(row)
        session.flush()
    return control_plane(session)


def update_profile(session: Session, profile_id: str, values: dict) -> dict:
    with session.begin():
        row = _get_profile(session, profile_id, lock=True)
        _apply(row, values)
        roles = session.scalars(select(ModelAssignment.role).where(ModelAssignment.profile_id == profile_id)).all()
        for role in roles:
            _require_compatible(row, role)
        row.version += 1
        row.updated_at = utcnow()
    return control_plane(session)


def delete_profile(session: Session, profile_id: str) -> dict:
    with session.begin():
        row = _get_profile(session, profile_id, lock=True)
        if session.scalar(select(ModelAssignment.role).where(ModelAssignment.profile_id == profile_id)) is not None:
            raise ApiError("MODEL_ASSIGNED", "已分配角色的 Model Profile 不能删除", 409)
        session.delete(row)
    return {"profile_id": profile_id, "deleted": True}


def assign_role(session: Session, role: str, profile_id: str) -> dict:
    with session.begin():
        row = _get_profile(session, profile_id, lock=True)
        _require_compatible(row, role)
        assignment = session.get(ModelAssignment, role, with_for_update=True)
        if assignment is None:
            session.add(ModelAssignment(role=role, profile_id=profile_id, updated_at=utcnow()))
        else:
            assignment.profile_id = profile_id
            assignment.updated_at = utcnow()
    return control_plane(session)
