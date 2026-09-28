from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, ValidationInfo, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]
_DIGEST_PATTERN = re.compile(r"^[0-9a-f]{64}$")

# DashScope text-embedding-v3 的官方维度取值
_EMBEDDING_DIMENSIONS = frozenset({1024, 768, 512})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: Literal["development", "test", "production"] = Field(
        default="development", validation_alias="APP_ENV"
    )
    database_url: SecretStr = Field(validation_alias="DATABASE_URL")
    test_database_url: SecretStr = Field(
        default=SecretStr(""), validation_alias="TEST_DATABASE_URL"
    )
    owner_a_id: str = Field(default="owner_a", min_length=1, max_length=128)
    owner_a_api_key_sha256: SecretStr = Field(validation_alias="OWNER_A_API_KEY_SHA256")
    owner_b_id: str = Field(default="owner_b", min_length=1, max_length=128)
    owner_b_api_key_sha256: SecretStr = Field(validation_alias="OWNER_B_API_KEY_SHA256")
    openai_api_key: SecretStr = Field(
        default=SecretStr(""), validation_alias="OPENAI_API_KEY"
    )
    openai_base_url: SecretStr = Field(
        default=SecretStr(""), validation_alias="OPENAI_BASE_URL"
    )
    fast_model: str = Field(default="step-3.7-flash", min_length=1, max_length=160)
    grader_model: str = Field(default="step-3.7-flash", min_length=1, max_length=160)
    answer_model: str = Field(default="step-3.7-flash", min_length=1, max_length=160)
    evaluator_model: str = Field(default="step-3.7-flash", min_length=1, max_length=160)
    embedding_api_key: SecretStr = Field(
        default=SecretStr(""), validation_alias="DASHSCOPE_API_KEY"
    )
    embedding_base_url: SecretStr = Field(
        default=SecretStr("https://dashscope.aliyuncs.com/compatible-mode/v1"),
        validation_alias="EMBEDDING_BASE_URL",
    )
    embedding_model: str = Field(
        default="text-embedding-v3", min_length=1, max_length=160
    )
    embedding_dimension: int = Field(default=1024)
    provider_timeout_seconds: float = Field(
        default=10.0, gt=0, le=20, allow_inf_nan=False
    )
    model_check_cooldown_seconds: int = Field(default=60, ge=0)
    model_check_lease_seconds: int = Field(default=120, gt=0)

    @field_validator("owner_a_id", "owner_b_id", mode="before")
    @classmethod
    def strip_owner_id(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator("owner_a_api_key_sha256", "owner_b_api_key_sha256")
    @classmethod
    def validate_key_digest(cls, value: SecretStr) -> SecretStr:
        if _DIGEST_PATTERN.fullmatch(value.get_secret_value()) is None:
            raise ValueError("应用 API Key 摘要必须为 64 位小写 SHA-256 十六进制")
        return value

    @field_validator("openai_base_url", "embedding_base_url")
    @classmethod
    def validate_base_url(cls, value: SecretStr, info: ValidationInfo) -> SecretStr:
        raw = value.get_secret_value().strip()
        if not raw and info.field_name == "embedding_base_url":
            raise ValueError("EMBEDDING_BASE_URL 不能为空")
        if raw:
            parsed = urlsplit(raw)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                raise ValueError(f"{info.field_name.upper()} 必须是 HTTP 或 HTTPS 地址")
            parsed.port
        return SecretStr(raw)

    @model_validator(mode="after")
    def validate_owner_keys(self) -> Settings:
        if (
            not self.owner_a_id
            or not self.owner_b_id
            or self.owner_a_id == self.owner_b_id
        ):
            raise ValueError("两个 owner ID 必须非空且不同")
        if (
            self.owner_a_api_key_sha256.get_secret_value()
            == self.owner_b_api_key_sha256.get_secret_value()
        ):
            raise ValueError("两个 owner 的 API Key 摘要必须不同")
        if self.model_check_lease_seconds <= 5 * self.provider_timeout_seconds:
            raise ValueError("模型检查 lease 必须覆盖五项 Provider timeout")
        return self

    @model_validator(mode="after")
    def validate_embedding_selection(self) -> Settings:
        if self.embedding_model != "text-embedding-v3":
            raise ValueError(f"未登记的 Embedding 模型：{self.embedding_model}")
        if self.embedding_dimension not in _EMBEDDING_DIMENSIONS:
            raise ValueError(
                f"{self.embedding_model} 不支持 {self.embedding_dimension} 维向量"
            )
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
