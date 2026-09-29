from __future__ import annotations

import hashlib
import json


MODEL_ROLE_REQUIREMENTS = {
    "answer": "supports_stream",
    "fast": "supports_structured_output",
    "grader": "supports_structured_output",
}


def model_catalog_snapshot(assignments: dict[str, dict[str, object]]) -> dict[str, object]:
    return {
        "schema_version": 1,
        "catalog_hash": stable_fingerprint(assignments),
        "assignments": assignments,
    }


def stable_fingerprint(value: object) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
