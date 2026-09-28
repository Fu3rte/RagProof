from __future__ import annotations

import hashlib
import hmac

from fastapi import Header

from backend.api.errors import ApiError
from backend.core.settings import get_settings


def require_owner(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> str:
    if not x_api_key:
        raise ApiError("AUTHENTICATION_REQUIRED", "需要有效的应用 API Key", 401)
    digest = hashlib.sha256(x_api_key.encode("utf-8")).hexdigest()
    settings = get_settings()
    owner_a_match = hmac.compare_digest(
        digest, settings.owner_a_api_key_sha256.get_secret_value()
    )
    owner_b_match = hmac.compare_digest(
        digest, settings.owner_b_api_key_sha256.get_secret_value()
    )
    if owner_a_match:
        return settings.owner_a_id
    if owner_b_match:
        return settings.owner_b_id
    raise ApiError("AUTHENTICATION_REQUIRED", "需要有效的应用 API Key", 401)
