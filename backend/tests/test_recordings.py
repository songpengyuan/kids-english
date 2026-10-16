"""录音资产存储 API（/api/v1/recordings）测试。

孩子发音音频 = 成长资产：上传原音（webm/wav）落盘 + 元数据入库，家长可回放。
本轮不耦合讯飞评测（评测分列 scores_json 预留，P2-3 接入时填充）。
"""
import io
import os
import tempfile
import uuid
from pathlib import Path

import pytest

if "KIDS_DB_PATH" not in os.environ:
    _tmp = tempfile.mkdtemp(prefix="kids-rec-test-")
    os.environ["KIDS_DB_PATH"] = str(Path(_tmp) / "test.db")
if "KIDS_JWT_SECRET" not in os.environ:
    os.environ["KIDS_JWT_SECRET"] = "test-secret-" + "k" * 32
# 媒体目录指向临时目录（必须在 import main 前设置，recordings 模块读取）
if "KIDS_MEDIA_ROOT" not in os.environ:
    _media = tempfile.mkdtemp(prefix="kids-rec-media-")
    os.environ["KIDS_MEDIA_ROOT"] = _media

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from app.ratelimit import reset as reset_ratelimit  # noqa: E402
from app.security import create_token  # noqa: E402

client = TestClient(app)

MEDIA = Path(os.environ["KIDS_MEDIA_ROOT"])


def _fake_webm(size=4096):
    """伪 webm 字节（回放接口只验证存取链路，不做真实解码）。"""
    return b"\x1aE\xdf\xa3" + bytes(range(255)) * (size // 255 + 1)


@pytest.fixture(autouse=True)
def fresh_db():
    from app.db import init_db
    from app.seed import seed_lessons

    reset_ratelimit()
    if Path(os.environ["KIDS_DB_PATH"]).exists():
        Path(os.environ["KIDS_DB_PATH"]).unlink()
    if MEDIA.is_dir():
        for p in MEDIA.iterdir():
            if p.is_dir():
                import shutil
                shutil.rmtree(p)
    init_db()
    seed_lessons()
    yield


def _setup_family(conn):
    conn.execute("INSERT INTO families (name, passcode_hash, passcode_salt) VALUES ('家A', 'h', 's')")
    fid = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
    conn.execute("INSERT INTO children (family_id, name) VALUES (?, '程程')", (fid,))
    cid = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
    conn.commit()
    return fid, cid


def _setup_other_family(conn):
    conn.execute("INSERT INTO families (name, passcode_hash, passcode_salt) VALUES ('家B', 'h', 's')")
    fid = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
    conn.execute("INSERT INTO children (family_id, name) VALUES (?, '别家娃')", (fid,))
    cid = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
    conn.commit()
    return fid, cid


def _auth(fid):
    return {"Authorization": f"Bearer {create_token(fid)}"}


def _upload(cid, payload=None, headers=None, name="a.webm", ctype="audio/webm", text="It is a frog."):
    payload = payload or _fake_webm()
    return client.post(
        f"/api/v1/children/{cid}/recordings",
        files={"file": (name, payload, ctype)},
        data={"text": text, "activity_type": "follow", "lesson_id": "l10", "duration_ms": 3000},
        headers=headers or {},
    )


# ---------- 鉴权与归属 ----------
def test_requires_login():
    r = _upload(1, headers={})
    assert r.status_code == 401


def test_child_not_in_family_rejected():
    conn = __import__("app.db", fromlist=["connect"]).connect()
    try:
        fid, _ = _setup_family(conn)
        other_fid, other_cid = _setup_other_family(conn)
        conn.close()
    finally:
        conn.close()
    # 用家A 的 token 访问家B 的孩子 → 404
    r = _upload(other_cid, headers=_auth(fid))
    assert r.status_code == 404


# ---------- 上传 ----------
def test_upload_persists_file_and_row():
    from app.db import connect
    fid, cid = _setup_family(connect())
    r = _upload(cid, headers=_auth(fid))
    body = r.json()
    assert r.status_code == 201  # REST：创建录音返回 201
    assert body["ok"] is True
    rid = body["id"]
    assert isinstance(rid, int)

    conn = connect()
    try:
        row = conn.execute("SELECT * FROM recordings WHERE id=?", (rid,)).fetchone()
        assert row["child_id"] == cid
        assert row["ref_text"] == "It is a frog."
        assert row["activity_type"] == "follow"
        assert row["lesson_id"] == "l10"
        assert row["duration_ms"] == 3000
        # ADR-005：file_path 存相对路径，解析需与 MEDIA_ROOT 拼接
        assert not row["file_path"].startswith("/")
        f = MEDIA / row["file_path"]
        assert f.exists() and f.stat().st_size > 0
        assert f.name.endswith(".webm")
    finally:
        conn.close()


def test_upload_too_short_rejected():
    from app.db import connect
    fid, cid = _setup_family(connect())
    r = _upload(cid, payload=b"x" * 64, headers=_auth(fid))
    assert r.status_code == 400  # REST：太短是客户端错误，非创建成功
    assert "音频太短" in r.json()["detail"]


def test_upload_wav_keeps_extension():
    from app.db import connect
    fid, cid = _setup_family(connect())
    r = _upload(cid, payload=_fake_webm(), name="a.wav", ctype="audio/wav", headers=_auth(fid))
    assert r.json()["ok"] is True
    conn = connect()
    try:
        row = conn.execute("SELECT file_path FROM recordings WHERE id=?", (r.json()["id"],)).fetchone()
        assert row["file_path"].endswith(".wav")
    finally:
        conn.close()


# ---------- 上传边界（ADR-005）----------
def _media_files(cid):
    d = MEDIA / str(cid)
    return [p for p in d.iterdir() if p.is_file()] if d.is_dir() else []


def test_upload_stores_relative_path():
    """file_path 必须是相对路径 —— 媒体根迁移（OSS/换机/灾备恢复）后历史行才不失效。"""
    from app.db import connect
    fid, cid = _setup_family(connect())
    rid = _upload(cid, headers=_auth(fid)).json()["id"]
    conn = connect()
    try:
        row = conn.execute("SELECT file_path FROM recordings WHERE id=?", (rid,)).fetchone()
        assert not row["file_path"].startswith("/")
        assert row["file_path"].startswith(f"{cid}/")
    finally:
        conn.close()


def test_upload_over_size_limit_rejected():
    """单条超过上限 → 413，且不落盘（读文件前就拒绝）。"""
    from app.api import recordings
    from app.db import connect
    fid, cid = _setup_family(connect())
    payload = b"x" * (recordings.MAX_UPLOAD_BYTES + 1024)
    r = _upload(cid, payload=payload, headers=_auth(fid))
    assert r.status_code == 413
    assert "过大" in r.json()["detail"]
    assert _media_files(cid) == []  # 不留半成品


def test_upload_count_quota_rejected():
    """单孩子条数配额 → 429。"""
    from app.api import recordings
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    for i in range(recordings.MAX_RECORDINGS_PER_CHILD):
        conn.execute(
            "INSERT INTO recordings (child_id, activity_type, file_path) VALUES (?, 'follow', ?)",
            (cid, f"{cid}/seed{i}.webm"),
        )
    conn.commit()
    conn.close()
    r = _upload(cid, headers=_auth(fid))
    assert r.status_code == 429
    assert "上限" in r.json()["detail"]


def test_upload_bytes_quota_rejected(monkeypatch):
    """单孩子容量配额 → 429，且刚写入的半成品被清理。"""
    from app.api import recordings
    from app.db import connect
    monkeypatch.setattr(recordings, "MAX_BYTES_PER_CHILD", 1024)
    fid, cid = _setup_family(connect())
    r = _upload(cid, payload=_fake_webm(4096), headers=_auth(fid))
    assert r.status_code == 429
    assert _media_files(cid) == []


# ---------- 列表 ----------
def test_list_returns_newest_first():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    h = _auth(fid)
    ids = []
    for i in range(3):
        ids.append(_upload(cid, payload=_fake_webm(4096 + i), headers=h).json()["id"])
    r = client.get(f"/api/v1/children/{cid}/recordings", headers=h)
    body = r.json()
    assert body["ok"] is True
    data = body["data"]
    assert [d["id"] for d in data] == list(reversed(ids))
    assert data[0]["ref_text"] == "It is a frog."
    assert "duration_ms" in data[0]
    assert "created_at" in data[0]
    assert "file_path" not in data[0]  # 列表不暴露服务器路径


def test_list_other_family_forbidden():
    from app.db import connect
    conn = connect()
    fid, _ = _setup_family(conn)
    _, other_cid = _setup_other_family(conn)
    r = client.get(f"/api/v1/children/{other_cid}/recordings", headers=_auth(fid))
    assert r.status_code == 404


# ---------- 回放 ----------
def test_audio_replay_returns_bytes():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    rid = _upload(cid, headers=_auth(fid)).json()["id"]
    r = client.get(f"/api/v1/children/{cid}/recordings/{rid}/audio", headers=_auth(fid))
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/")
    assert len(r.content) > 1000


def test_audio_replay_other_family_forbidden():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    rid = _upload(cid, headers=_auth(fid)).json()["id"]
    _, other_fid = _setup_other_family(conn)
    r = client.get(f"/api/v1/children/{cid}/recordings/{rid}/audio", headers=_auth(other_fid))
    assert r.status_code == 404


def test_audio_missing_404():
    from app.db import connect
    fid, _ = _setup_family(connect())
    # 不存在的录音 id（此前这条 URL 少了一段 rid，属测试自身笔误 ——
    # 新增 DELETE /recordings/{rid} 后该路径会被 {rid} 模式吞掉、返回 405 而非 404）
    r = client.get("/api/v1/children/99999/recordings/99999/audio", headers=_auth(fid))
    assert r.status_code == 404


def test_replay_supports_legacy_absolute_path():
    """历史行可能存的是绝对路径 —— 回放的兼容分支必须仍然可用。"""
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    p = MEDIA / str(cid) / "legacy.webm"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(_fake_webm())
    conn.execute(
        "INSERT INTO recordings (child_id, activity_type, file_path) VALUES (?, 'follow', ?)",
        (cid, str(p)),  # 绝对路径
    )
    rid = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
    conn.commit()
    conn.close()
    r = client.get(f"/api/v1/children/{cid}/recordings/{rid}/audio", headers=_auth(fid))
    assert r.status_code == 200
