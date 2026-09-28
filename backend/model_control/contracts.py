from __future__ import annotations

import hashlib
import json

from backend.core.settings import Settings


ROLE_PURPOSES = {
    "fast": ("检索表达重写", "structured_output"),
    "grader": ("相关性、可回答性、缺少条件与来源冲突判断", "structured_output"),
    "answer": ("基于 EvidencePack 生成 claims", "chat_completion"),
    "evaluator": ("正确性、依据充分性、完整性与冲突披露判断", "structured_output"),
}
ROLE_ORDER = ("fast", "grader", "answer", "evaluator")


def stable_fingerprint(value: object) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _chat_endpoint_fingerprint(settings: Settings) -> str:
    value = settings.openai_base_url.get_secret_value().strip()
    return hashlib.sha256(
        (value or "https://api.openai.com/v1").encode("utf-8")
    ).hexdigest()


def _embedding_endpoint_fingerprint(settings: Settings) -> str:
    value = settings.embedding_base_url.get_secret_value().strip()
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def role_configurations(settings: Settings) -> list[dict[str, object]]:
    models = {
        "fast": settings.fast_model,
        "grader": settings.grader_model,
        "answer": settings.answer_model,
        "evaluator": settings.evaluator_model,
    }
    endpoint = _chat_endpoint_fingerprint(settings)
    configurations = []
    for role in ROLE_ORDER:
        purpose, capability = ROLE_PURPOSES[role]
        configuration = {
            "role": role,
            "model_name": models[role],
            "purpose": purpose,
            "required_capability": capability,
            "timeout_seconds": settings.provider_timeout_seconds,
            "config_fingerprint": stable_fingerprint(
                {
                    "role": role,
                    "model_name": models[role],
                    "purpose": purpose,
                    "required_capability": capability,
                    "timeout_seconds": settings.provider_timeout_seconds,
                    "provider_endpoint_fingerprint": endpoint,
                }
            ),
        }
        configurations.append(configuration)
    return configurations


def embedding_configuration(settings: Settings) -> dict[str, object]:
    return {
        "model_name": settings.embedding_model,
        "dimension": settings.embedding_dimension,
        "timeout_seconds": settings.provider_timeout_seconds,
        "required_capability": "embedding_vector",
        "config_fingerprint": stable_fingerprint(
            {
                "model_name": settings.embedding_model,
                "dimension": settings.embedding_dimension,
                "timeout_seconds": settings.provider_timeout_seconds,
                "required_capability": "embedding_vector",
                "provider_endpoint_fingerprint": _embedding_endpoint_fingerprint(
                    settings
                ),
            }
        ),
    }


def configuration_fingerprint(settings: Settings) -> str:
    return stable_fingerprint(
        {
            "roles": role_configurations(settings),
            "embedding": embedding_configuration(settings),
        }
    )


def run_config_snapshot(settings: Settings) -> dict[str, object]:
    roles = role_configurations(settings)
    embedding = embedding_configuration(settings)
    return {
        "schema_version": 1,
        "roles": {
            str(item["role"]): {
                key: item[key]
                for key in (
                    "role",
                    "model_name",
                    "purpose",
                    "timeout_seconds",
                    "config_fingerprint",
                )
            }
            for item in roles
        },
        "embedding": {
            "model_name": embedding["model_name"],
            "dimension": embedding["dimension"],
            "config_fingerprint": embedding["config_fingerprint"],
        },
        "config_fingerprint": configuration_fingerprint(settings),
    }
