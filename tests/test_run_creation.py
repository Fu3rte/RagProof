from __future__ import annotations

import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from backend.db.models import Message, Run, RunEvent
from tests.support import APP, TestSession, configure_models, migrate_test_database, restore_models


class RunCreationTests(unittest.TestCase):
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
        response = self.client.post("/v1/threads", json={"title": "verification"})
        self.assertEqual(201, response.status_code, response.text)
        self.thread_id = response.json()["thread_id"]

    def tearDown(self) -> None:
        with TestSession.begin() as session:
            for run in session.scalars(select(Run).where(Run.thread_id == self.thread_id)):
                run.status = "succeeded"
        response = self.client.delete(f"/v1/threads/{self.thread_id}")
        self.assertEqual(200, response.status_code, response.text)
        self.client.close()

    def create(self, key: str, question: str = "第一问"):
        return self.client.post("/v1/runs", json={
            "thread_id": self.thread_id, "question": question, "idempotency_key": key,
        })

    def test_run_and_messages_and_event_commit_together(self) -> None:
        response = self.create("verification-create")
        self.assertEqual(201, response.status_code, response.text)
        run_id = response.json()["run"]["id"]
        with TestSession() as session:
            run = session.get(Run, run_id)
            events = session.scalars(select(RunEvent).where(RunEvent.run_id == run_id)).all()
            messages = session.scalars(select(Message).where(Message.run_id == run_id).order_by(Message.sequence)).all()
        self.assertEqual(1, run.last_event_sequence)
        self.assertEqual([(1, "run.created", {"status": "queued"})], [(e.sequence, e.event_type, e.payload) for e in events])
        self.assertEqual([(1, "user", "completed"), (2, "assistant", "streaming")], [(m.sequence, m.role, m.status) for m in messages])
        thread = next(item for item in self.client.get("/v1/threads").json()["threads"] if item["thread_id"] == self.thread_id)
        self.assertEqual((2, 2), (thread["message_count"], thread["version"]))
        self.assertEqual(409, self.client.delete(f"/v1/threads/{self.thread_id}").status_code)

    def test_idempotency_conflict_and_event_cursor(self) -> None:
        first = self.create("verification-key")
        self.assertEqual(201, first.status_code, first.text)
        second = self.create("verification-key", " 第一问 ")
        self.assertEqual(200, second.status_code, second.text)
        self.assertEqual(first.json()["run"]["id"], second.json()["run"]["id"])
        conflict = self.create("verification-key", "另一问")
        self.assertEqual(409, conflict.status_code, conflict.text)
        run_id = first.json()["run"]["id"]
        page = self.client.get(f"/v1/runs/{run_id}/events?after=0&limit=1")
        self.assertEqual([1], [item["sequence"] for item in page.json()["items"]])
        self.assertEqual([], self.client.get(f"/v1/runs/{run_id}/events?after=1").json()["items"])
        with TestSession() as session:
            self.assertEqual(2, session.scalar(select(func.count()).select_from(Message).where(Message.run_id == run_id)))

    def test_concurrent_same_key_creates_one_run(self) -> None:
        barrier = Barrier(2)

        def submit():
            with TestClient(APP, raise_server_exceptions=False) as client:
                barrier.wait()
                response = client.post("/v1/runs", json={
                    "thread_id": self.thread_id, "question": "并发问题", "idempotency_key": "verification-parallel",
                })
                return response.status_code, response.json()

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: submit(), range(2)))
        self.assertEqual({200, 201}, {status for status, _ in responses})
        ids = {body["run"]["id"] for _, body in responses}
        self.assertEqual(1, len(ids))
        with TestSession() as session:
            run_id = ids.pop()
            self.assertEqual(1, session.scalar(select(func.count()).select_from(RunEvent).where(RunEvent.run_id == run_id)))
            self.assertEqual(2, session.scalar(select(func.count()).select_from(Message).where(Message.run_id == run_id)))

    def test_validation_and_health(self) -> None:
        self.assertEqual(200, self.client.get("/v1/ready").status_code)
        self.assertEqual(404, self.client.post("/v1/runs", json={"thread_id": "thread_" + "f" * 32, "question": "x", "idempotency_key": "missing"}).status_code)
        for question in ("", "  ", "x" * 4001):
            self.assertEqual(422, self.create("validation", question).status_code)


if __name__ == "__main__":
    unittest.main()
