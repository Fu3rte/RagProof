from __future__ import annotations

import io
import logging
import unittest
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import delete

from tests.support import (
    APP,
    OWNER_A_ID,
    SETTINGS,
    TestSession,
    api_key_for,
    migrate_test_database,
)

from backend.api.errors import ApiError
from backend.core.settings import Settings
from backend.db.models import ModelCheck
from backend.model_control.contracts import (
    embedding_configuration,
    role_configurations,
)
from backend.model_control.service import run_model_check


def settings_for(**overrides: str) -> Settings:
    values = {
        "DATABASE_URL": SETTINGS.database_url.get_secret_value(),
        "OWNER_A_API_KEY_SHA256": "a" * 64,
        "OWNER_B_API_KEY_SHA256": "b" * 64,
        "OPENAI_API_KEY": "test-chat-key",
        "OPENAI_BASE_URL": "https://api.stepfun.com/step_plan/v1",
        "DASHSCOPE_API_KEY": "",
    }
    values.update(overrides)
    return Settings(**values)


class EmbeddingConfigurationTests(unittest.TestCase):
    def test_embedding_dimension_must_match_the_model_support_set(self) -> None:
        with self.assertRaises(ValidationError):
            settings_for(EMBEDDING_DIMENSION="64")
        with self.assertRaises(ValidationError):
            settings_for(EMBEDDING_MODEL="text-embedding-v9")

    def test_embedding_endpoint_is_an_independent_configuration_identity(self) -> None:
        base = settings_for()
        moved_embedding = settings_for(
            EMBEDDING_BASE_URL="https://example.com/compatible-mode/v1"
        )
        moved_chat = settings_for(OPENAI_BASE_URL="https://example.com/v1")
        self.assertNotEqual(
            embedding_configuration(base)["config_fingerprint"],
            embedding_configuration(moved_embedding)["config_fingerprint"],
        )
        self.assertEqual(
            role_configurations(base), role_configurations(moved_embedding)
        )
        self.assertEqual(
            embedding_configuration(base)["config_fingerprint"],
            embedding_configuration(moved_chat)["config_fingerprint"],
        )
        self.assertNotEqual(role_configurations(base), role_configurations(moved_chat))

    def test_embedding_credentials_fail_independently_of_chat_credentials(self) -> None:
        settings = settings_for(OPENAI_BASE_URL="http://127.0.0.1:1/v1")
        with TestSession() as session:
            with self.assertRaises(ApiError) as raised:
                run_model_check(session, owner_id=OWNER_A_ID, settings=settings)
        checks = {
            str(item["role"]): item for item in raised.exception.details["checks"]
        }
        self.assertEqual("credentials_missing", checks["embedding"]["error_category"])
        self.assertEqual(settings.embedding_model, checks["embedding"]["model_name"])
        for role in ("fast", "grader", "answer", "evaluator"):
            self.assertEqual("connection_error", checks[role]["error_category"])


class ModelProviderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        migrate_test_database()

    def setUp(self) -> None:
        with TestSession.begin() as session:
            session.execute(delete(ModelCheck).where(ModelCheck.owner_id == OWNER_A_ID))
        self.client = TestClient(APP, raise_server_exceptions=False)
        self.headers = {"X-API-Key": api_key_for(OWNER_A_ID)}

    def tearDown(self) -> None:
        self.client.close()
        with TestSession.begin() as session:
            session.execute(delete(ModelCheck).where(ModelCheck.owner_id == OWNER_A_ID))

    def test_models_exposes_latest_check_as_null_before_a_check(self) -> None:
        response = self.client.get("/api/models", headers=self.headers)
        self.assertEqual(200, response.status_code)
        self.assertEqual(4, len(response.json()["roles"]))
        self.assertEqual(
            "embedding_vector", response.json()["embedding"]["required_capability"]
        )
        self.assertIsNone(response.json()["latest_check"])

    def test_existing_unexpired_lease_rejects_concurrent_check(self) -> None:
        now = datetime.now(UTC)
        with TestSession.begin() as session:
            session.add(
                ModelCheck(
                    owner_id=OWNER_A_ID,
                    status="running",
                    lease_expires_at=now + timedelta(seconds=60),
                    last_started_at=now,
                    updated_at=now,
                )
            )
        response = self.client.post("/api/models/check", headers=self.headers)
        self.assertEqual(409, response.status_code)
        self.assertEqual("MODEL_CHECK_IN_PROGRESS", response.json()["error"]["code"])

    def test_model_check_cooldown_is_persisted_and_returns_retry_seconds(self) -> None:
        now = datetime.now(UTC)
        with TestSession.begin() as session:
            session.add(
                ModelCheck(
                    owner_id=OWNER_A_ID,
                    status="failed",
                    last_started_at=now,
                    last_finished_at=now,
                    result={"items": []},
                    updated_at=now,
                )
            )
        response = self.client.post("/api/models/check", headers=self.headers)
        self.assertEqual(429, response.status_code)
        self.assertEqual("MODEL_CHECK_RATE_LIMITED", response.json()["error"]["code"])
        self.assertIn("retry_after_seconds", response.json()["error"]["details"])
        self.assertIn("Retry-After", response.headers)

    def test_missing_provider_credentials_persist_failed_check(self) -> None:
        if (
            SETTINGS.openai_api_key.get_secret_value().strip()
            or SETTINGS.embedding_api_key.get_secret_value().strip()
        ):
            self.skipTest("Provider 凭据已配置，使用真实集成检查")
        response = self.client.post("/api/models/check", headers=self.headers)
        self.assertEqual(503, response.status_code)
        self.assertEqual("PROVIDER_CHECK_FAILED", response.json()["error"]["code"])
        with TestSession() as session:
            row = session.get(ModelCheck, OWNER_A_ID)
        self.assertEqual("failed", row.status)
        self.assertEqual(
            ["fast", "grader", "answer", "evaluator", "embedding"],
            [item["role"] for item in row.result["items"]],
        )
        self.assertTrue(
            all(
                item["error_category"] == "credentials_missing"
                for item in row.result["items"]
            )
        )

    def test_real_provider_roles_embedding_usage_and_persisted_result(self) -> None:
        provider_key = SETTINGS.openai_api_key.get_secret_value().strip()
        embedding_key = SETTINGS.embedding_api_key.get_secret_value().strip()
        if not provider_key or not embedding_key:
            self.skipTest(
                "OPENAI_API_KEY 或 DASHSCOPE_API_KEY 未配置，真实 Provider 检查 blocked"
            )
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        logger = logging.getLogger("ragproof.http")
        previous_level = logger.level
        logger.setLevel(logging.INFO)
        logger.addHandler(handler)
        try:
            checked = self.client.post("/api/models/check", headers=self.headers)
            latest = self.client.get("/api/models", headers=self.headers)
        finally:
            logger.removeHandler(handler)
            logger.setLevel(previous_level)
        self.assertEqual(200, checked.status_code)
        result = checked.json()
        self.assertEqual("succeeded", result["status"])
        self.assertEqual(
            ["fast", "grader", "answer", "evaluator", "embedding"],
            [item["role"] for item in result["items"]],
        )
        for item in result["items"]:
            self.assertTrue(item["success"])
            self.assertGreaterEqual(item["latency_ms"], 0)
            self.assertIn("usage", item)
            checked_at = datetime.fromisoformat(
                item["checked_at"].replace("Z", "+00:00")
            )
            self.assertEqual(UTC, checked_at.tzinfo)
            if item["usage"] is not None:
                self.assertEqual(
                    {"input_tokens", "output_tokens", "total_tokens"},
                    set(item["usage"]),
                )
                for count in item["usage"].values():
                    self.assertTrue(
                        count is None or (type(count) is int and count >= 0)
                    )
            if item["role"] == "embedding":
                self.assertEqual(
                    SETTINGS.embedding_dimension, item["embedding_dimension"]
                )
        self.assertEqual(200, latest.status_code)
        self.assertEqual("succeeded", latest.json()["latest_check"]["status"])
        self.assertEqual(result["items"], latest.json()["latest_check"]["items"])
        for secret in (provider_key, embedding_key):
            self.assertNotIn(secret, checked.text)
            self.assertNotIn(secret, latest.text)
            self.assertNotIn(secret, stream.getvalue())


if __name__ == "__main__":
    unittest.main()
