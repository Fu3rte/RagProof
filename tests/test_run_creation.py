from __future__ import annotations

import io
import json
import logging
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

from tests.support import (
    APP,
    OWNER_A_ID,
    OWNER_B_ID,
    SETTINGS,
    TestSession,
    api_key_for,
    assert_test_database_isolated,
    migrate_test_database,
)

from backend.db.models import ModelCheck, Run, RunEvent


class RunCreationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        migrate_test_database()

    def setUp(self) -> None:
        self.clean_owner_data()
        self.client = TestClient(APP, raise_server_exceptions=False)

    def tearDown(self) -> None:
        self.client.close()
        self.clean_owner_data()

    @staticmethod
    def clean_owner_data() -> None:
        owners = (OWNER_A_ID, OWNER_B_ID)
        with TestSession.begin() as session:
            run_ids = select(Run.id).where(Run.owner_id.in_(owners))
            session.execute(delete(RunEvent).where(RunEvent.run_id.in_(run_ids)))
            session.execute(delete(Run).where(Run.owner_id.in_(owners)))
            session.execute(delete(ModelCheck).where(ModelCheck.owner_id.in_(owners)))

    def request_headers(self, owner_id: str = OWNER_A_ID) -> dict[str, str]:
        return {"X-API-Key": api_key_for(owner_id)}

    def create(
        self,
        key: str,
        question: str = "请问该制度适用于哪些人员？",
        owner_id: str = OWNER_A_ID,
    ):
        return self.client.post(
            "/api/runs",
            headers=self.request_headers(owner_id),
            json={"question": question, "idempotency_key": key},
        )

    def test_health_and_ready_use_real_service_state(self) -> None:
        health = self.client.get("/api/health")
        ready = self.client.get("/api/ready")
        self.assertEqual(200, health.status_code)
        self.assertEqual({"status": "ok"}, health.json())
        self.assertEqual(200, ready.status_code)
        self.assertEqual({"status": "ready", "database": "ready"}, ready.json())

    def test_missing_and_invalid_keys_return_401(self) -> None:
        missing = self.client.get("/api/me")
        empty = self.client.get("/api/me", headers={"X-API-Key": ""})
        invalid = self.client.get("/api/me", headers={"X-API-Key": "invalid"})
        self.assertEqual(401, missing.status_code)
        self.assertEqual(401, empty.status_code)
        self.assertEqual("AUTHENTICATION_REQUIRED", missing.json()["error"]["code"])
        self.assertEqual(401, invalid.status_code)

    def test_two_api_keys_map_to_distinct_owners(self) -> None:
        owner_a = self.client.get("/api/me", headers=self.request_headers())
        owner_b = self.client.get("/api/me", headers=self.request_headers(OWNER_B_ID))
        self.assertEqual({"owner_id": OWNER_A_ID}, owner_a.json())
        self.assertEqual({"owner_id": OWNER_B_ID}, owner_b.json())

    def test_create_persists_queued_run_and_one_initial_event(self) -> None:
        response = self.create("create-event")
        self.assertEqual(201, response.status_code)
        body = response.json()
        self.assertTrue(body["created"])
        self.assertNotIn("owner_id", body["run"])
        self.assertNotIn("request_hash", body["run"])
        self.assertRegex(body["run"]["id"], r"^run_[0-9a-f]{32}$")
        self.assertEqual("queued", body["run"]["status"])
        with TestSession() as session:
            events = list(
                session.scalars(
                    select(RunEvent).where(RunEvent.run_id == body["run"]["id"])
                )
            )
            run = session.get(Run, body["run"]["id"])
        self.assertEqual(1, len(events))
        self.assertEqual("run.created", events[0].event_type)
        self.assertEqual(1, events[0].sequence)
        self.assertEqual({"status": "queued"}, events[0].payload)
        self.assertEqual(1, run.last_event_sequence)

    def test_run_and_created_event_are_committed_together(self) -> None:
        response = self.create("transaction-pair")
        run_id = response.json()["run"]["id"]
        with TestSession() as session:
            run = session.get(Run, run_id)
            event = session.scalar(
                select(RunEvent).where(
                    RunEvent.run_id == run_id,
                    RunEvent.sequence == 1,
                    RunEvent.event_type == "run.created",
                )
            )
        self.assertIsNotNone(run)
        self.assertIsNotNone(event)
        self.assertEqual(run.last_event_sequence, event.sequence)

    def test_same_owner_key_and_normalized_request_reuses_original_run(self) -> None:
        first = self.client.post(
            "/api/runs",
            headers=self.request_headers(),
            json={"question": "  适用人员？\n ", "idempotency_key": " key-1 "},
        )
        second = self.client.post(
            "/api/runs",
            headers=self.request_headers(),
            json={"question": "适用人员？", "idempotency_key": "key-1"},
        )
        self.assertEqual(201, first.status_code)
        self.assertEqual(200, second.status_code)
        self.assertFalse(second.json()["created"])
        self.assertEqual(first.json()["run"]["id"], second.json()["run"]["id"])

    def test_same_key_with_different_request_returns_409(self) -> None:
        first = self.create("conflict-key", "问题一")
        second = self.create("conflict-key", "问题二")
        self.assertEqual(201, first.status_code)
        self.assertEqual(409, second.status_code)
        self.assertEqual("IDEMPOTENCY_CONFLICT", second.json()["error"]["code"])

    def test_concurrent_same_key_creates_one_run_and_event(self) -> None:
        barrier = Barrier(2)

        def submit() -> tuple[int, dict]:
            with TestClient(APP, raise_server_exceptions=False) as client:
                barrier.wait()
                response = client.post(
                    "/api/runs",
                    headers=self.request_headers(),
                    json={
                        "question": "并发登记问题",
                        "idempotency_key": "parallel-key",
                    },
                )
                return response.status_code, response.json()

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: submit(), range(2)))
        self.assertEqual({200, 201}, {status for status, _ in responses})
        run_ids = {body["run"]["id"] for _, body in responses}
        self.assertEqual(1, len(run_ids))
        run_id = run_ids.pop()
        with TestSession() as session:
            run_count = session.scalar(
                select(func.count()).select_from(Run).where(Run.id == run_id)
            )
            events = list(
                session.scalars(select(RunEvent).where(RunEvent.run_id == run_id))
            )
        self.assertEqual(1, run_count)
        self.assertEqual(1, len(events))
        self.assertEqual(1, events[0].sequence)

    def test_question_and_idempotency_validation(self) -> None:
        for question in ("", "   ", "x" * 4001):
            with self.subTest(question_length=len(question)):
                self.assertEqual(
                    422, self.create(f"question-{len(question)}", question).status_code
                )
        self.assertEqual(422, self.create(" ").status_code)
        self.assertEqual(422, self.create("x" * 129).status_code)

    def test_owner_b_cannot_read_owner_a_run_or_events(self) -> None:
        created = self.create("private-run")
        run_id = created.json()["run"]["id"]
        run = self.client.get(
            f"/api/runs/{run_id}", headers=self.request_headers(OWNER_B_ID)
        )
        events = self.client.get(
            f"/api/runs/{run_id}/events", headers=self.request_headers(OWNER_B_ID)
        )
        self.assertEqual(404, run.status_code)
        self.assertEqual(404, events.status_code)

    def test_owner_list_isolation(self) -> None:
        self.create("owner-a-only")
        owner_b = self.client.get("/api/runs", headers=self.request_headers(OWNER_B_ID))
        self.assertEqual(200, owner_b.status_code)
        self.assertEqual([], owner_b.json()["items"])
        self.assertEqual(0, owner_b.json()["total"])

    def test_list_pagination_is_bounded_and_stably_sorted(self) -> None:
        ids = [self.create(f"page-{index}").json()["run"]["id"] for index in range(3)]
        with TestSession.begin() as session:
            for index, run_id in enumerate(ids):
                run = session.get(Run, run_id)
                run.created_at = datetime(2025, 1, 1, tzinfo=UTC) + timedelta(
                    seconds=index
                )
        first = self.client.get(
            "/api/runs?offset=0&limit=2", headers=self.request_headers()
        )
        second = self.client.get(
            "/api/runs?offset=2&limit=2", headers=self.request_headers()
        )
        invalid = self.client.get("/api/runs?limit=101", headers=self.request_headers())
        self.assertEqual(200, first.status_code)
        self.assertEqual(200, second.status_code)
        self.assertEqual(422, invalid.status_code)
        page_ids = [
            item["id"] for item in first.json()["items"] + second.json()["items"]
        ]
        self.assertEqual(list(reversed(ids)), page_ids)
        self.assertEqual(3, first.json()["total"])

    def test_event_after_cursor_and_limit(self) -> None:
        run_id = self.create("event-cursor").json()["run"]["id"]
        with TestSession.begin() as session:
            run = session.get(Run, run_id)
            run.last_event_sequence = 3
            session.add_all(
                [
                    RunEvent(
                        event_id=f"evt_{uuid4().hex}",
                        run_id=run_id,
                        sequence=2,
                        event_type="run.progress",
                        payload={"status": "queued"},
                    ),
                    RunEvent(
                        event_id=f"evt_{uuid4().hex}",
                        run_id=run_id,
                        sequence=3,
                        event_type="run.progress",
                        payload={"status": "queued"},
                    ),
                ]
            )
        page = self.client.get(
            f"/api/runs/{run_id}/events?after=1&limit=1",
            headers=self.request_headers(),
        )
        empty = self.client.get(
            f"/api/runs/{run_id}/events?after=3&limit=1",
            headers=self.request_headers(),
        )
        self.assertEqual(2, page.json()["items"][0]["sequence"])
        self.assertEqual(2, page.json()["next_after"])
        self.assertEqual([], empty.json()["items"])
        self.assertEqual(3, empty.json()["next_after"])

    def test_public_responses_events_and_logs_exclude_credentials(self) -> None:
        from tests.support import OWNER_A_KEY, OWNER_B_KEY

        provider_key = SETTINGS.openai_api_key.get_secret_value()
        digests = (
            SETTINGS.owner_a_api_key_sha256.get_secret_value(),
            SETTINGS.owner_b_api_key_sha256.get_secret_value(),
        )
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        logger = logging.getLogger("ragproof.http")
        previous_level = logger.level
        logger.setLevel(logging.INFO)
        logger.addHandler(handler)
        try:
            models = self.client.get("/api/models", headers=self.request_headers())
            created = self.create("secret-scan")
            run_id = created.json()["run"]["id"]
            events = self.client.get(
                f"/api/runs/{run_id}/events", headers=self.request_headers()
            )
        finally:
            logger.removeHandler(handler)
            logger.setLevel(previous_level)
        public = json.dumps(
            [models.json(), created.json(), events.json()], ensure_ascii=False
        )
        with TestSession() as session:
            stored_event = session.scalar(
                select(RunEvent).where(RunEvent.run_id == run_id)
            )
            event_json = json.dumps(stored_event.payload, ensure_ascii=False)
        captured = stream.getvalue()
        for secret in (OWNER_A_KEY, OWNER_B_KEY, *digests, provider_key):
            if secret:
                self.assertNotIn(secret, public)
                self.assertNotIn(secret, event_json)
                self.assertNotIn(secret, captured)

    def test_run_snapshot_contains_public_role_configuration_only(self) -> None:
        response = self.create("snapshot")
        snapshot = response.json()["run"]["config_snapshot"]
        self.assertEqual(
            {"fast", "grader", "answer", "evaluator"}, set(snapshot["roles"])
        )
        self.assertIn("embedding", snapshot)
        serialized = json.dumps(snapshot, ensure_ascii=False)
        for secret in (
            SETTINGS.openai_api_key.get_secret_value(),
            SETTINGS.owner_a_api_key_sha256.get_secret_value(),
            SETTINGS.owner_b_api_key_sha256.get_secret_value(),
        ):
            if secret:
                self.assertNotIn(secret, serialized)

    def test_unknown_api_path_uses_json_not_found_contract(self) -> None:
        response = self.client.get("/api/unknown-resource")
        self.assertEqual(404, response.status_code)
        self.assertEqual("NOT_FOUND", response.json()["error"]["code"])
        self.assertEqual(
            "application/json", response.headers["content-type"].split(";")[0]
        )

    def test_test_database_guard_rejects_business_database_name(self) -> None:
        with self.assertRaises(RuntimeError):
            assert_test_database_isolated(
                SETTINGS.database_url.get_secret_value(),
                SETTINGS.database_url.get_secret_value(),
            )


if __name__ == "__main__":
    unittest.main()
