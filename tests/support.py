from __future__ import annotations

import atexit
import hashlib
import os
import secrets
from pathlib import Path

from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker


OWNER_A_KEY = secrets.token_urlsafe(32)
OWNER_B_KEY = secrets.token_urlsafe(32)
OWNER_A_ID = "test_owner_a"
OWNER_B_ID = "test_owner_b"
os.environ["APP_ENV"] = "test"
os.environ["OWNER_A_ID"] = OWNER_A_ID
os.environ["OWNER_A_API_KEY_SHA256"] = hashlib.sha256(OWNER_A_KEY.encode()).hexdigest()
os.environ["OWNER_B_ID"] = OWNER_B_ID
os.environ["OWNER_B_API_KEY_SHA256"] = hashlib.sha256(OWNER_B_KEY.encode()).hexdigest()


def _database_name(value: str) -> str:
    database = make_url(value).database
    if not database:
        raise RuntimeError("数据库 URL 必须包含数据库名")
    return database


def assert_test_database_isolated(database_url: str, test_database_url: str) -> None:
    if not test_database_url.strip():
        raise RuntimeError("测试启动要求设置 TEST_DATABASE_URL")
    database_name = _database_name(database_url)
    test_database_name = _database_name(test_database_url)
    if database_name == test_database_name:
        raise RuntimeError("TEST_DATABASE_URL 必须指向独立数据库")


from backend.core.settings import get_settings  # noqa: E402


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


from backend.app import create_app  # noqa: E402


APP = create_app(database_engine=TEST_ENGINE)


def api_key_for(owner_id: str) -> str:
    if owner_id == OWNER_A_ID:
        return OWNER_A_KEY
    if owner_id == OWNER_B_ID:
        return OWNER_B_KEY
    raise ValueError("未知测试 owner")
