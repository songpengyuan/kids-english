"""数据库迁移版本化（ADR-002）测试。

手写 SQL 的迁移系统：``schema_migrations`` 台账 + 有序 ``MIGRATIONS`` 列表。
关键保证：空库建到最新版本、幂等（重复 init_db 不重复记账）、
存量库（列已补但无台账）被安全「收养」、迁移失败必须抛出（→ 服务拒绝启动）。
"""
import os
import sqlite3
import tempfile
from pathlib import Path

import pytest

if "KIDS_DB_PATH" not in os.environ:
    _tmp = tempfile.mkdtemp(prefix="kids-mig-test-")
    os.environ["KIDS_DB_PATH"] = str(Path(_tmp) / "test.db")
if "KIDS_JWT_SECRET" not in os.environ:
    os.environ["KIDS_JWT_SECRET"] = "test-secret-" + "k" * 32

import app.db as dbmod  # noqa: E402
from app.db import MIGRATIONS, connect, init_db, schema_version  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    p = Path(os.environ["KIDS_DB_PATH"])
    if p.exists():
        p.unlink()
    yield


def _versions(db_path):
    c = sqlite3.connect(db_path)
    c.row_factory = sqlite3.Row
    try:
        return [r["version"] for r in c.execute("SELECT version FROM schema_migrations ORDER BY version")]
    finally:
        c.close()


def test_fresh_db_applies_all_migrations():
    init_db()
    conn = connect()
    try:
        assert schema_version(conn) == MIGRATIONS[-1][0]
        rows = conn.execute(
            "SELECT version, name FROM schema_migrations ORDER BY version"
        ).fetchall()
        assert [r["version"] for r in rows] == [v for v, _, _ in sorted(MIGRATIONS)]
        assert [r["name"] for r in rows] == [n for _, n, _ in sorted(MIGRATIONS)]
    finally:
        conn.close()


def test_migrations_are_idempotent():
    """重复 init_db：台账条数不变、applied_at 不被刷新（说明迁移没被重复执行）。"""
    init_db()
    conn = connect()
    try:
        before_n = conn.execute("SELECT COUNT(*) AS n FROM schema_migrations").fetchone()["n"]
        before_at = [
            r["applied_at"]
            for r in conn.execute("SELECT applied_at FROM schema_migrations ORDER BY version")
        ]
    finally:
        conn.close()

    init_db()

    conn = connect()
    try:
        after_n = conn.execute("SELECT COUNT(*) AS n FROM schema_migrations").fetchone()["n"]
        after_at = [
            r["applied_at"]
            for r in conn.execute("SELECT applied_at FROM schema_migrations ORDER BY version")
        ]
    finally:
        conn.close()
    assert before_n == after_n
    assert before_at == after_at


def test_legacy_db_without_ledger_is_adopted(tmp_path, monkeypatch):
    """存量库（列已补好、但没有 schema_migrations 台账）首次 init_db 应直接记账，不报错。

    模拟「上线时还没有版本化机制」的真实情况：迁移函数是幂等的，所以对已补列的库是 no-op。
    """
    db = tmp_path / "legacy.db"
    conn = sqlite3.connect(db)
    try:
        conn.executescript(dbmod.SCHEMA)   # 建到当前结构
        conn.executescript("DROP TABLE schema_migrations;")  # 但抹掉台账 = 旧世界
        conn.commit()
    finally:
        conn.close()
    monkeypatch.setattr(dbmod, "DB_PATH", db)

    dbmod.init_db()  # 不应抛异常

    assert _versions(db) == [v for v, _, _ in sorted(MIGRATIONS)]


def test_failed_migration_raises_and_rolls_back(tmp_path, monkeypatch):
    """迁移失败必须抛出（→ lifespan 异常 → 服务拒绝启动），且本迁移的改动被回滚。"""
    db = tmp_path / "fail.db"
    monkeypatch.setattr(dbmod, "DB_PATH", db)

    def boom(conn):
        conn.execute("CREATE TABLE __boom (id INTEGER)")  # SQLite 的 DDL 可回滚
        raise RuntimeError("boom")

    monkeypatch.setattr(dbmod, "MIGRATIONS", dbmod.MIGRATIONS + [(999, "boom", boom)])

    with pytest.raises(RuntimeError):
        dbmod.init_db()

    versions = _versions(db)
    assert [v for v, _, _ in sorted(MIGRATIONS)] == versions  # 1/2 成功记账
    assert 999 not in versions                                  # 失败的不记账

    c = sqlite3.connect(db)
    try:
        t = c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='__boom'").fetchone()
    finally:
        c.close()
    assert t is None  # ROLLBACK 生效，半成品表没留下
