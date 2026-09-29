from __future__ import annotations

import atexit
from pathlib import Path

from uuid import uuid4

from sqlalchemy import Engine, create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from backend.core.settings import get_settings


def assert_test_database_isolated(database_url: str, test_database_url: str) -> None:
    if not test_database_url.strip():
        raise RuntimeError("测试启动要求设置 TEST_DATABASE_URL")
    primary = make_url(database_url).database
    isolated = make_url(test_database_url).database
    if not primary or not isolated or primary == isolated or isolated != "ragproof_test":
        raise RuntimeError("TEST_DATABASE_URL 必须指向独立的 ragproof_test 数据库")


SETTINGS = get_settings()
assert_test_database_isolated(
    SETTINGS.database_url.get_secret_value(),
    SETTINGS.test_database_url.get_secret_value(),
)
TEST_DATABASE_URL = SETTINGS.test_database_url.get_secret_value()
TEST_ENGINE: Engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
atexit.register(TEST_ENGINE.dispose)
TestSession = sessionmaker(bind=TEST_ENGINE, autoflush=False, expire_on_commit=False)


def migrate_test_database() -> None:
    from alembic import command
    from alembic.config import Config

    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL.replace("%", "%%"))
    command.upgrade(config, "head")
    with TEST_ENGINE.connect() as connection:
        revision = connection.scalar(text("SELECT version_num FROM alembic_version"))
    if revision != "0003_day01_single_user":
        raise RuntimeError(f"隔离数据库迁移版本异常: {revision}")


from backend.app import create_app  # noqa: E402


APP = create_app(database_engine=TEST_ENGINE)


def configure_models(client) -> tuple[list[str], dict[str, str]]:
    from backend.db.models import ModelAssignment

    with TestSession() as session:
        previous = dict(session.execute(select(ModelAssignment.role, ModelAssignment.profile_id)).all())
    ids = []
    for role in ("answer", "fast", "grader"):
        name = f"verification-{role}-{uuid4().hex}"
        created = client.post("/v1/models", json={
            "display_name": name,
            "model_name": f"verification-{role}",
            "provider": "openai",
        })
        assert created.status_code == 201, created.text
        profile_id = next(item["id"] for item in created.json()["profiles"] if item["display_name"] == name)
        ids.append(profile_id)
        assigned = client.put(f"/v1/models/assignments/{role}", json={"profile_id": profile_id})
        assert assigned.status_code == 200, assigned.text
    return ids, previous


def restore_models(client, ids: list[str], previous: dict[str, str]) -> None:
    from backend.db.models import ModelAssignment

    for role in ("answer", "fast", "grader"):
        if role in previous:
            response = client.put(f"/v1/models/assignments/{role}", json={"profile_id": previous[role]})
            assert response.status_code == 200, response.text
        else:
            with TestSession.begin() as session:
                assignment = session.get(ModelAssignment, role)
                session.delete(assignment)
    for profile_id in ids:
        response = client.delete(f"/v1/models/{profile_id}")
        assert response.status_code == 200, response.text
