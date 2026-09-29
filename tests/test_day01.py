from __future__ import annotations

import io
import logging
import unittest
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from backend.app import create_app
from backend.db.models import Run
from tests.support import (
    APP, SETTINGS, TEST_DATABASE_URL, TestSession, assert_test_database_isolated,
    configure_models, migrate_test_database, restore_models,
)


class Day01Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        migrate_test_database()
        with TestClient(APP, raise_server_exceptions=False) as client:
            cls.profile_ids, cls.previous = configure_models(client)

    @classmethod
    def tearDownClass(cls) -> None:
        with TestClient(APP, raise_server_exceptions=False) as client:
            restore_models(client, cls.profile_ids, cls.previous)

    def setUp(self) -> None:
        self.client = TestClient(APP, raise_server_exceptions=False)
        created = self.client.post("/v1/threads", json={"title": "持久化校验"})
        self.assertEqual(201, created.status_code, created.text)
        self.thread_id = created.json()["thread_id"]

    def tearDown(self) -> None:
        with TestSession.begin() as session:
            for run in session.scalars(select(Run).where(Run.thread_id == self.thread_id)):
                run.status = "succeeded"
        deleted = self.client.delete(f"/v1/threads/{self.thread_id}")
        self.assertEqual(200, deleted.status_code, deleted.text)
        self.client.close()

    def ask(self, question: str):
        response = self.client.post("/v1/runs", json={
            "thread_id": self.thread_id,
            "question": question,
            "idempotency_key": uuid4().hex,
        })
        self.assertEqual(201, response.status_code, response.text)
        return response.json()["run"]

    def test_migration_isolated_and_reconnect_readback(self) -> None:
        assert_test_database_isolated(SETTINGS.database_url.get_secret_value(), TEST_DATABASE_URL)
        with self.assertRaises(RuntimeError):
            assert_test_database_isolated(TEST_DATABASE_URL, TEST_DATABASE_URL)
        self.assertEqual("ragproof_test", make_url(TEST_DATABASE_URL).database)
        engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        with engine.connect() as connection:
            self.assertEqual("0003_day01_single_user", connection.scalar(text("SELECT version_num FROM alembic_version")))
        engine.dispose()
        self.ask("重连回读")
        engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        with Session(engine) as session:
            row = session.scalar(select(Run).where(Run.thread_id == self.thread_id))
            self.assertEqual("重连回读", row.question)
        engine.dispose()
        restart_engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
        with TestClient(create_app(database_engine=restart_engine), raise_server_exceptions=False) as restarted:
            messages = restarted.get(f"/v1/threads/{self.thread_id}/messages")
            self.assertEqual(200, messages.status_code, messages.text)
            self.assertEqual(["user", "assistant"], [item["role"] for item in messages.json()["messages"]])
        restart_engine.dispose()

    def test_message_before_pagination(self) -> None:
        for index in range(3):
            self.ask(f"问题 {index}")
        url = f"/v1/threads/{self.thread_id}/messages?limit=2"
        latest = self.client.get(url).json()
        self.assertEqual([5, 6], [item["sequence"] for item in latest["messages"]])
        self.assertEqual(5, latest["previous_cursor"])
        middle = self.client.get(url + "&before=5").json()
        self.assertEqual([3, 4], [item["sequence"] for item in middle["messages"]])
        self.assertEqual(3, middle["previous_cursor"])
        oldest = self.client.get(url + "&before=3").json()
        self.assertEqual([1, 2], [item["sequence"] for item in oldest["messages"]])
        self.assertIsNone(oldest["previous_cursor"])
        self.assertEqual(422, self.client.get(url + "&before=0").status_code)

    def test_assignment_change_preserves_snapshot_and_secret_absent(self) -> None:
        run = self.ask("冻结模型")
        snapshot = run["model_snapshot_json"]
        original_hash = run["model_catalog_hash"]
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        logger = logging.getLogger("ragproof.http")
        logger.addHandler(handler)
        try:
            changed = self.client.put("/v1/models/assignments/answer", json={"profile_id": self.profile_ids[1]})
            self.assertEqual(200, changed.status_code, changed.text)
            with TestClient(APP, raise_server_exceptions=False) as restarted:
                readback = restarted.get(f"/v1/runs/{run['id']}")
                events = restarted.get(f"/v1/runs/{run['id']}/events")
                self.assertEqual(200, readback.status_code, readback.text)
                self.assertEqual(snapshot, readback.json()["model_snapshot_json"])
                self.assertEqual(original_hash, readback.json()["model_catalog_hash"])
                self.assertNotEqual(original_hash, changed.json()["catalog_hash"])
            public = changed.text + readback.text + events.text + stream.getvalue()
            key = SETTINGS.openai_api_key.get_secret_value()
            if key:
                self.assertNotIn(key, public)
        finally:
            logger.removeHandler(handler)
            restored = self.client.put("/v1/models/assignments/answer", json={"profile_id": self.profile_ids[0]})
            self.assertEqual(200, restored.status_code, restored.text)


if __name__ == "__main__":
    unittest.main()
