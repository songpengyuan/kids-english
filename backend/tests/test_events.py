"""埋点事件 API（/api/v1/events）与每日汇总（ADR-004）测试。

覆盖：鉴权/归属校验、批量写入、client_event_id 幂等、payload 截断、
条数上限、汇总进 daily_stats、保留期清理。
"""
import json
import os
from pathlib import Path

import pytest

from fastapi.testclient import TestClient

from main import app  # noqa: E402
from app.ratelimit import reset as reset_ratelimit  # noqa: E402
from app.security import create_token  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def fresh_db():
    from app.db import init_db

    reset_ratelimit()
    p = Path(os.environ["KIDS_DB_PATH"])
    if p.exists():
        p.unlink()
    init_db()
    yield


def _setup_family(conn, name="家A"):
    conn.execute(
        "INSERT INTO families (name, passcode_hash, passcode_salt) VALUES (?, 'h', 's')", (name,)
    )
    fid = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
    conn.execute("INSERT INTO children (family_id, name) VALUES (?, '程程')", (fid,))
    cid = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
    conn.commit()
    return fid, cid


def _auth(fid):
    return {"Authorization": f"Bearer {create_token(fid)}"}


def _evt(i, **kw):
    d = {
        "client_event_id": f"e{i}",
        "type": "activity_done",
        "payload": {"seconds": 30, "active": True},
    }
    d.update(kw)
    return d


def _post(events, fid, cid=None):
    if cid is not None:
        for e in events:
            e.setdefault("child_id", cid)
    return client.post("/api/v1/events", json={"events": events}, headers=_auth(fid))


# ---------- 鉴权 / 归属 ----------
def test_requires_login():
    r = client.post("/api/v1/events", json={"events": [_evt(1)]})
    assert r.status_code == 401


def test_other_family_child_rejected():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    other_fid, other_cid = _setup_family(conn, name="家B")
    conn.close()
    r = _post([_evt(1)], fid, cid=other_cid)  # 用家A 的 token 写家B 的孩子
    assert r.status_code == 404


# ---------- 写入 ----------
def test_batch_insert():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    conn.close()
    r = _post([_evt(1), _evt(2), _evt(3)], fid, cid=cid)
    assert r.status_code == 201
    body = r.json()
    assert body == {"ok": True, "received": 3, "accepted": 3}

    conn = connect()
    try:
        n = conn.execute("SELECT COUNT(*) AS n FROM events WHERE child_id=?", (cid,)).fetchone()["n"]
    finally:
        conn.close()
    assert n == 3


def test_client_event_id_is_idempotent():
    """同一 client_event_id 重复上报（客户端重试）不产生重复行。"""
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    conn.close()

    r1 = _post([_evt(1), _evt(2)], fid, cid=cid)
    assert r1.json()["accepted"] == 2

    r2 = _post([_evt(1), _evt(2)], fid, cid=cid)  # 重发同样两条
    assert r2.status_code == 201
    assert r2.json()["accepted"] == 0  # 全部被 IGNORE

    conn = connect()
    try:
        n = conn.execute("SELECT COUNT(*) AS n FROM events").fetchone()["n"]
    finally:
        conn.close()
    assert n == 2


def test_over_batch_limit_is_422():
    """单次 >50 条在请求校验层直接拒绝（契约里 max_length=50）。"""
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    conn.close()
    r = _post([_evt(i) for i in range(51)], fid, cid=cid)
    assert r.status_code == 422


def test_oversized_payload_is_truncated():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    conn.close()
    big = {"blob": "x" * 4000}
    r = _post([_evt(1, payload=big)], fid, cid=cid)
    assert r.status_code == 201
    conn = connect()
    try:
        raw = conn.execute("SELECT payload_json FROM events WHERE client_event_id='e1'").fetchone()[
            "payload_json"
        ]
    finally:
        conn.close()
    assert "_truncated" in json.loads(raw)


def test_app_version_and_client_ts_persisted():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    conn.close()
    r = _post(
        [_evt(1, app_version="abc123", client_ts="2026-10-17T10:00:00Z")], fid, cid=cid
    )
    assert r.status_code == 201
    conn = connect()
    try:
        row = conn.execute(
            "SELECT app_version, client_ts FROM events WHERE client_event_id='e1'"
        ).fetchone()
    finally:
        conn.close()
    assert row["app_version"] == "abc123"
    assert row["client_ts"].startswith("2026-10-17")


# ---------- 汇总与保留期 ----------
def test_rollup_writes_daily_stats():
    from app.db import connect
    from app.rollup import rollup_day

    conn = connect()
    fid, cid = _setup_family(conn)
    conn.close()
    _post(
        [
            _evt(1, payload={"seconds": 60, "active": True}, client_ts="2026-10-16T09:00:00Z"),
            _evt(2, payload={"seconds": 40, "active": True}, client_ts="2026-10-16T09:05:00Z"),
            _evt(3, payload={"seconds": 20, "active": False}, client_ts="2026-10-16T20:00:00Z"),
        ],
        fid,
        cid=cid,
    )
    conn = connect()
    try:
        rollup_day(conn, "2026-10-16")
        conn.commit()
        row = conn.execute(
            "SELECT active_seconds, passive_seconds, activities FROM daily_stats WHERE child_id=?",
            (cid,),
        ).fetchone()
    finally:
        conn.close()
    assert row["active_seconds"] == 100
    assert row["passive_seconds"] == 20
    assert row["activities"] == 3


def test_rollup_is_idempotent():
    """重复汇总同一天不会累加（先算后覆盖）。"""
    from app.db import connect
    from app.rollup import rollup_day

    conn = connect()
    fid, cid = _setup_family(conn)
    conn.close()
    _post([_evt(1, payload={"seconds": 60, "active": True}, client_ts="2026-10-16T09:00:00Z")], fid, cid=cid)

    conn = connect()
    try:
        rollup_day(conn, "2026-10-16")
        conn.commit()
        rollup_day(conn, "2026-10-16")
        conn.commit()
        row = conn.execute(
            "SELECT active_seconds FROM daily_stats WHERE child_id=?", (cid,)
        ).fetchone()
    finally:
        conn.close()
    assert row["active_seconds"] == 60


def test_purge_removes_expired_events():
    from app.db import connect
    from app.rollup import purge

    conn = connect()
    fid, cid = _setup_family(conn)
    # 手工塞一条「很久以前」的事件
    conn.execute(
        """INSERT INTO events (client_event_id, family_id, child_id, type, server_ts)
           VALUES ('old', ?, ?, 'session_start', '2020-01-01 00:00:00')""",
        (fid, cid),
    )
    conn.commit()
    try:
        removed = purge(conn, keep_days=180)
        conn.commit()
        n = conn.execute("SELECT COUNT(*) AS n FROM events").fetchone()["n"]
    finally:
        conn.close()
    assert removed == 1
    assert n == 0
