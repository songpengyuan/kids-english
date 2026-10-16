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
        f"/api/v1/recordings/{cid}",
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
    assert r.status_code == 200
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
        f = Path(row["file_path"])
        assert f.exists() and f.stat().st_size > 0
        assert f.name.endswith(".webm")
    finally:
        conn.close()


def test_upload_too_short_rejected():
    from app.db import connect
    fid, cid = _setup_family(connect())
    r = _upload(cid, payload=b"x" * 64, headers=_auth(fid))
    assert r.status_code == 200
    assert r.json()["ok"] is False
    assert r.json()["error"] == "audio_too_short"


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


# ---------- 列表 ----------
def test_list_returns_newest_first():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    h = _auth(fid)
    ids = []
    for i in range(3):
        ids.append(_upload(cid, payload=_fake_webm(4096 + i), headers=h).json()["id"])
    r = client.get(f"/api/v1/recordings/{cid}", headers=h)
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
    r = client.get(f"/api/v1/recordings/{other_cid}", headers=_auth(fid))
    assert r.status_code == 404


# ---------- 回放 ----------
def test_audio_replay_returns_bytes():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    rid = _upload(cid, headers=_auth(fid)).json()["id"]
    r = client.get(f"/api/v1/recordings/{rid}/audio", headers=_auth(fid))
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/")
    assert len(r.content) > 1000


def test_audio_replay_other_family_forbidden():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    rid = _upload(cid, headers=_auth(fid)).json()["id"]
    _, other_fid = _setup_other_family(conn)
    r = client.get(f"/api/v1/recordings/{rid}/audio", headers=_auth(other_fid))
    assert r.status_code == 404


def test_audio_missing_404():
    from app.db import connect
    fid, _ = _setup_family(connect())
    r = client.get("/api/v1/recordings/99999/audio", headers=_auth(fid))
    assert r.status_code == 404
