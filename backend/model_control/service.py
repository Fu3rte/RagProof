from __future__ import annotations

import math
import time
from datetime import datetime, timedelta
from typing import Any, Literal

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    OpenAI,
    OpenAIError,
)
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from backend.api.errors import ApiError
from backend.core.settings import Settings
from backend.db.models import ModelCheck
from backend.infra.database import utcnow
from backend.model_control.contracts import (
    ROLE_ORDER,
    configuration_fingerprint,
    embedding_configuration,
    role_configurations,
)


class _FastProbe(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rewritten_query: str = Field(min_length=1)


class _GraderProbe(BaseModel):
    model_config = ConfigDict(extra="forbid")

    relevance: Literal["none", "weak", "strong"]
    answerability: Literal["none", "partial", "sufficient"]


class _EvaluatorProbe(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: int = Field(ge=0, le=1)
    reason: str = Field(min_length=1)


class _CapabilityMismatch(Exception):
    def __init__(self, category: str):
        super().__init__(category)
        self.category = category


def _usage(response: Any) -> dict[str, int | None] | None:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None
    return {
        "input_tokens": getattr(usage, "prompt_tokens", None),
        "output_tokens": getattr(usage, "completion_tokens", None),
        "total_tokens": getattr(usage, "total_tokens", None),
    }


def _error_category(error: Exception) -> str:
    if isinstance(error, _CapabilityMismatch):
        return error.category
    if isinstance(error, ValidationError):
        return "schema_validation_failed"
    if isinstance(error, APITimeoutError):
        return "timeout"
    if isinstance(error, APIConnectionError):
        return "connection_error"
    if isinstance(error, APIStatusError):
        return "provider_status_error"
    return "provider_error"


def _chat_response(
    client: OpenAI, model: str, system: str, prompt: str, schema: type[BaseModel]
):
    response = client.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        response_format=schema,
    )
    if not response.choices:
        raise _CapabilityMismatch("invalid_structured_output")
    parsed = response.choices[0].message.parsed
    if parsed is None:
        raise _CapabilityMismatch("invalid_structured_output")
    schema.model_validate(parsed.model_dump())
    return response, parsed


def _probe_one(
    client: OpenAI,
    settings: Settings,
    role: str,
    config: dict[str, Any],
) -> dict[str, Any]:
    started = time.perf_counter()
    checked_at = utcnow().isoformat()
    usage = None
    dimension = None
    try:
        if role == "embedding":
            response = client.embeddings.create(
                model=settings.embedding_model,
                input="制度适用人员",
                dimensions=settings.embedding_dimension,
                encoding_format="float",
            )
            if len(response.data) != 1:
                raise _CapabilityMismatch("invalid_embedding_count")
            vector = response.data[0].embedding
            dimension = len(vector)
            if dimension != settings.embedding_dimension:
                raise _CapabilityMismatch("embedding_dimension_mismatch")
            if any(
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
                for value in vector
            ):
                raise _CapabilityMismatch("invalid_embedding_values")
            usage = _usage(response)
            model_name = settings.embedding_model
            capability = "embedding_vector"
        elif role == "fast":
            response, _ = _chat_response(
                client,
                str(config["model_name"]),
                "将问题改写为简短检索表达。",
                "制度适用人员？",
                _FastProbe,
            )
            usage = _usage(response)
            model_name = str(config["model_name"])
            capability = "structured_output"
        elif role == "grader":
            response, _ = _chat_response(
                client,
                str(config["model_name"]),
                "只按指定字段评估给定证据。",
                "问题：制度适用人员？证据：本制度适用于全体员工。",
                _GraderProbe,
            )
            usage = _usage(response)
            model_name = str(config["model_name"])
            capability = "structured_output"
        elif role == "answer":
            response = client.chat.completions.create(
                model=str(config["model_name"]),
                messages=[
                    {"role": "system", "content": "只输出一个简短中文词。"},
                    {"role": "user", "content": "回答：制度适用哪些人员？"},
                ],
                max_completion_tokens=128000,
            )
            if not response.choices:
                raise _CapabilityMismatch("empty_chat_completion")
            content = response.choices[0].message.content
            print(f"answer content={content!r}")
            if not isinstance(content, str) or not content.strip():
                raise _CapabilityMismatch("empty_chat_completion")
            usage = _usage(response)
            model_name = str(config["model_name"])
            capability = "chat_completion"
        else:
            response, _ = _chat_response(
                client,
                str(config["model_name"]),
                "根据给定回答评估正确性，简短说明理由。",
                "问题：制度适用哪些人员？回答：全体员工。",
                _EvaluatorProbe,
            )
            usage = _usage(response)
            model_name = str(config["model_name"])
            capability = "structured_output"
        return {
            "role": role,
            "success": True,
            "latency_ms": max(0, int((time.perf_counter() - started) * 1000)),
            "model_name": model_name,
            "capability": capability,
            "usage": usage,
            "embedding_dimension": dimension,
            "checked_at": checked_at,
            "error_category": None,
        }
    except (_CapabilityMismatch, OpenAIError, ValidationError) as error:
        return {
            "role": role,
            "success": False,
            "latency_ms": max(0, int((time.perf_counter() - started) * 1000)),
            "model_name": settings.embedding_model
            if role == "embedding"
            else str(config["model_name"]),
            "capability": "embedding_vector"
            if role == "embedding"
            else str(config["required_capability"]),
            "usage": usage,
            "embedding_dimension": dimension,
            "checked_at": checked_at,
            "error_category": _error_category(error),
        }


def _failure_items(
    settings: Settings, roles: tuple[str, ...], category: str
) -> list[dict[str, Any]]:
    checked_at = utcnow().isoformat()
    configurations = {
        str(config["role"]): config for config in role_configurations(settings)
    }
    items = [
        {
            "role": role,
            "success": False,
            "latency_ms": 0,
            "model_name": settings.embedding_model
            if role == "embedding"
            else configurations[role]["model_name"],
            "capability": "embedding_vector"
            if role == "embedding"
            else configurations[role]["required_capability"],
            "usage": None,
            "embedding_dimension": None,
            "checked_at": checked_at,
            "error_category": category,
        }
        for role in roles
    ]
    return items


def _claim(session: Session, owner_id: str, settings: Settings) -> datetime:
    now = utcnow()
    with session.begin():
        session.execute(
            insert(ModelCheck)
            .values(owner_id=owner_id, status="idle", updated_at=now)
            .on_conflict_do_nothing(index_elements=[ModelCheck.owner_id])
        )
        row = session.scalar(
            select(ModelCheck).where(ModelCheck.owner_id == owner_id).with_for_update()
        )
        if row is None:
            raise RuntimeError("模型检查记录不可读取")
        if (
            row.status == "running"
            and row.lease_expires_at is not None
            and row.lease_expires_at > now
        ):
            raise ApiError("MODEL_CHECK_IN_PROGRESS", "当前账号已有模型检查执行中", 409)
        if row.last_started_at is not None:
            available_at = row.last_started_at + timedelta(
                seconds=settings.model_check_cooldown_seconds
            )
            if available_at > now:
                retry_after = (available_at - now).total_seconds()
                raise ApiError(
                    "MODEL_CHECK_RATE_LIMITED",
                    "模型检查仍处于冷却时间",
                    429,
                    {"retry_after_seconds": retry_after},
                    retry_after,
                )
        row.status = "running"
        row.lease_expires_at = now + timedelta(
            seconds=settings.model_check_lease_seconds
        )
        row.last_started_at = now
        row.last_finished_at = None
        row.result = None
        row.updated_at = now
    return now


def _finish(
    session: Session,
    owner_id: str,
    status: str,
    result: dict[str, Any],
) -> None:
    with session.begin():
        row = session.scalar(
            select(ModelCheck).where(ModelCheck.owner_id == owner_id).with_for_update()
        )
        if row is None:
            raise RuntimeError("模型检查 lease 丢失")
        finished_at = datetime.fromisoformat(result["finished_at"])
        row.status = status
        row.lease_expires_at = None
        row.last_finished_at = finished_at
        row.result = result
        row.updated_at = finished_at


def list_models(
    session: Session, *, owner_id: str, settings: Settings
) -> dict[str, Any]:
    row = session.get(ModelCheck, owner_id)
    latest = None
    if row is not None:
        result = row.result or {}
        latest = {
            "status": row.status,
            "started_at": row.last_started_at,
            "finished_at": row.last_finished_at,
            "total_latency_ms": result.get("total_latency_ms"),
            "config_fingerprint": result.get("config_fingerprint"),
            "items": result.get("items", []),
        }
    return {
        "roles": role_configurations(settings),
        "embedding": embedding_configuration(settings),
        "config_fingerprint": configuration_fingerprint(settings),
        "latest_check": latest,
    }


def run_model_check(
    session: Session, *, owner_id: str, settings: Settings
) -> dict[str, Any]:
    started_at = _claim(session, owner_id, settings)
    timer = time.perf_counter()
    roles: dict[str, dict[str, Any]] = {
        str(config["role"]): config for config in role_configurations(settings)
    }
    roles["embedding"] = embedding_configuration(settings)
    providers = (
        (
            ROLE_ORDER,
            settings.openai_api_key.get_secret_value().strip(),
            settings.openai_base_url.get_secret_value().strip() or None,
        ),
        (
            ("embedding",),
            settings.embedding_api_key.get_secret_value().strip(),
            settings.embedding_base_url.get_secret_value().strip(),
        ),
    )
    items: list[dict[str, Any]] = []
    for provider_roles, key, base_url in providers:
        if not key:
            items.extend(
                _failure_items(settings, provider_roles, "credentials_missing")
            )
            continue
        try:
            client = OpenAI(
                api_key=key,
                base_url=base_url,
                timeout=settings.provider_timeout_seconds,
                max_retries=0,
            )
        except OpenAIError:
            items.extend(
                _failure_items(settings, provider_roles, "provider_configuration_error")
            )
            continue
        items.extend(
            _probe_one(client, settings, role, roles[role]) for role in provider_roles
        )
        client.close()
    finished_at = utcnow()
    result = {
        "items": items,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "total_latency_ms": max(0, int((time.perf_counter() - timer) * 1000)),
        "config_fingerprint": configuration_fingerprint(settings),
    }
    success = all(item["success"] for item in items)
    _finish(session, owner_id, "succeeded" if success else "failed", result)
    if not success:
        categories = {item["error_category"] for item in items if not item["success"]}
        mismatch = any(
            category
            in {
                "schema_validation_failed",
                "invalid_structured_output",
                "invalid_embedding_count",
                "embedding_dimension_mismatch",
                "invalid_embedding_values",
                "empty_chat_completion",
            }
            for category in categories
        )
        code = "PROVIDER_CAPABILITY_MISMATCH" if mismatch else "PROVIDER_CHECK_FAILED"
        status_code = 502 if mismatch else 503
        message = (
            "Provider 返回结果未满足模型能力契约"
            if mismatch
            else "Provider 能力检查失败"
        )
        raise ApiError(
            code,
            message,
            status_code,
            {
                "checks": items,
                "started_at": started_at.isoformat(),
                "finished_at": finished_at.isoformat(),
                "total_latency_ms": result["total_latency_ms"],
                "config_fingerprint": result["config_fingerprint"],
            },
        )
    return {"status": "succeeded", **result}
