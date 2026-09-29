from __future__ import annotations

import io
import logging
import os
import unittest
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.core.settings import get_settings
from tests.support import APP, SETTINGS, migrate_test_database


class ModelProviderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        migrate_test_database()

    def setUp(self) -> None:
        self.client = TestClient(APP, raise_server_exceptions=False)
        self.name = f"verification-model-{uuid4().hex}"
        created = self.client.post("/v1/models", json={
            "display_name": self.name,
            "provider": "openai",
            "model_name": "verification-model",
            "supports_stream": False,
            "supports_structured_output": True,
        })
        self.assertEqual(201, created.status_code, created.text)
        self.profile_id = next(item["id"] for item in created.json()["profiles"] if item["display_name"] == self.name)

    def tearDown(self) -> None:
        deleted = self.client.delete(f"/v1/models/{self.profile_id}")
        self.assertEqual(200, deleted.status_code, deleted.text)
        self.client.close()

    def test_provider_secret_status_from_server_settings(self) -> None:
        marker = "provider-status-secret-marker"
        original = os.environ.get("OPENAI_API_KEY")
        try:
            for secret in ("", marker):
                with self.subTest(configured=bool(secret)):
                    os.environ["OPENAI_API_KEY"] = secret
                    get_settings.cache_clear()
                    self.assertEqual(secret, get_settings().openai_api_key.get_secret_value())
                    stream = io.StringIO()
                    handler = logging.StreamHandler(stream)
                    logger = logging.getLogger("ragproof.http")
                    logger.addHandler(handler)
                    try:
                        readback = self.client.get("/v1/models")
                        updated = self.client.put(f"/v1/models/{self.profile_id}", json={
                            "display_name": self.name,
                            "provider": "openai",
                            "model_name": "verification-model",
                        })
                    finally:
                        logger.removeHandler(handler)
                    for response in (readback, updated):
                        self.assertEqual(200, response.status_code, response.text)
                        self.assertIs(response.json()["provider_secret_configured"], bool(secret))
                        self.assertNotIn(marker, response.text)
                    self.assertNotIn(marker, stream.getvalue())
        finally:
            if original is None:
                os.environ.pop("OPENAI_API_KEY", None)
            else:
                os.environ["OPENAI_API_KEY"] = original
            get_settings.cache_clear()

    def test_profile_capability_validation_and_secret_exclusion(self) -> None:
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        logger = logging.getLogger("ragproof.http")
        logger.addHandler(handler)
        try:
            rejected = self.client.put(f"/v1/models/assignments/answer", json={"profile_id": self.profile_id})
            self.assertEqual(409, rejected.status_code, rejected.text)
            invalid_url = self.client.put(f"/v1/models/{self.profile_id}", json={
                "display_name": self.name,
                "provider": "openai",
                "model_name": "verification-model",
                "base_url": "https://user:secret-marker@example.org/v1",
            })
            self.assertEqual(422, invalid_url.status_code, invalid_url.text)
            catalog = self.client.get("/v1/models")
            self.assertEqual(200, catalog.status_code, catalog.text)
        finally:
            logger.removeHandler(handler)
        self.assertEqual(1, next(item["version"] for item in catalog.json()["profiles"] if item["id"] == self.profile_id))
        for secret in ("secret-marker", SETTINGS.openai_api_key.get_secret_value()):
            if secret:
                self.assertNotIn(secret, rejected.text + invalid_url.text + catalog.text + stream.getvalue())


if __name__ == "__main__":
    unittest.main()
