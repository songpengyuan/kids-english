"""录音生命周期与家长数据主权接口（ADR-005）测试。

覆盖：删除单条（含跨家庭 404）、列表 has_audio、打包导出、
保留期清理（删音频留分数）、孤儿文件清理。
"""
import io
import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from main import app  # noqa: E402
from app.ratelimit import reset as reset_ratelimit  # noqa: E402
from app.security import create_token  # noqa: E402

client = TestClient(app)

MEDIA = Path(os.environ["KIDS_MEDIA_ROOT"])


def _fake_webm(size=4096):
    return b"\x1aE\xdf\xa3" + bytes(range(255)) * (size // 255 + 1)


@pytest.fixture(autouse=True)
def fresh_db():
    from app.db import init_db

    reset_ratelimit()
    p = Path(os.environ["KIDS_DB_PATH"])
    if p.exists():
        p.unlink()
    if MEDIA.is_dir():
        for sub in MEDIA.iterdir():
            if sub.is_dir():
                shutil.rmtree(sub)
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


def _upload(cid, fid, name="a.webm", ctype="audio/webm"):
    return client.post(
        f"/api/v1/children/{cid}/recordings",
        files={"file": (name, _fake_webm(), ctype)},
        data={"text": "It is a frog.", "activity_type": "follow", "lesson_id": "l10"},
        headers=_auth(fid),
    )


# ---------- 删除单条 ----------
def test_delete_recording_removes_row_and_file():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    conn.close()
    rid = _upload(cid, fid).json()["id"]

    conn = connect()
    row = conn.execute("SELECT file_path FROM recordings WHERE id=?", (rid,)).fetchone()
    conn.close()
    f = MEDIA / row["file_path"]
    assert f.exists()

    r = client.delete(f"/api/v1/children/{cid}/recordings/{rid}", headers=_auth(fid))
    assert r.status_code == 200
    assert r.json()["ok"] is True

    conn = connect()
    try:
        assert conn.execute("SELECT id FROM recordings WHERE id=?", (rid,)).fetchone() is None
    finally:
        conn.close()
    assert not f.exists()


def test_delete_other_family_forbidden():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    other_fid, _ = _setup_family(conn, name="家B")
    conn.close()
    rid = _upload(cid, fid).json()["id"]
    r = client.delete(f"/api/v1/children/{cid}/recordings/{rid}", headers=_auth(other_fid))
    assert r.status_code == 404


def test_replay_after_delete_is_404():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    conn.close()
    rid = _upload(cid, fid).json()["id"]
    client.delete(f"/api/v1/children/{cid}/recordings/{rid}", headers=_auth(fid))
    r = client.get(f"/api/v1/children/{cid}/recordings/{rid}/audio", headers=_auth(fid))
    assert r.status_code == 404


# ---------- 列表 has_audio ----------
def test_list_reports_has_audio():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    conn.close()
    _upload(cid, fid)
    r = client.get(f"/api/v1/children/{cid}/recordings", headers=_auth(fid))
    assert r.json()["data"][0]["has_audio"] is True


# ---------- 打包导出 ----------
def test_export_zip_contains_audio_and_meta():
    from app.db import connect
    conn = connect()
    fid, cid = _setup_family(conn)
    conn.close()
    rid = _upload(cid, fid).json()["id"]

    r = client.get(f"/api/v1/children/{cid}/recordings/export", headers=_auth(fid))
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"

    z = zipfile.ZipFile(io.BytesIO(r.content))
    names = z.namelist()
    assert "recordings.json" in names
    assert any(n.startswith("audio/") for n in names)
    meta = json.loads(z.read("recordings.json"))
    assert meta[0]["id"] == rid
    assert meta[0]["audio"] is not None
    assert meta[0]["ref_text"] == "It is a frog."


# ---------- 保留期：删音频、留分数 ----------
def test_purge_expired_keeps_row_and_scores():
    from app.db import connect
    from app.retention import purge_expired

    conn = connect()
    fid, cid = _setup_family(conn)
    conn.close()
    rid = _upload(cid, fid).json()["id"]

    conn = connect()
    # 给这条记录补一个评测分，并把创建时间改老
    conn.execute(
        "UPDATE recordings SET scores_json=?, created_at='2020-01-01 00:00:00' WHERE id=?",
        (json.dumps({"total": 88.5}), rid),
    )
    conn.commit()
    row = conn.execute("SELECT file_path FROM recordings WHERE id=?", (rid,)).fetchone()
    f = MEDIA / row["file_path"]

    purged = purge_expired(conn, MEDIA, keep_days=90)
    conn.commit()
    row2 = conn.execute(
        "SELECT file_path, purged_at, scores_json FROM recordings WHERE id=?", (rid,)
    ).fetchone()
    conn.close()

    assert purged == 1
    assert row2["file_path"] == ""            # 音频引用清空
    assert row2["purged_at"] is not None      # 标记清理时间
    assert json.loads(row2["scores_json"])["total"] == 88.5  # 分数保留
    assert not f.exists()                     # 文件已删


def test_purge_expired_skips_recent():
    from app.db import connect
    from app.retention import purge_expired

    conn = connect()
    fid, cid = _setup_family(conn)
    conn.close()
    _upload(cid, fid)
    conn = connect()
    try:
        assert purge_expired(conn, MEDIA, keep_days=90) == 0  # 刚上传的不动
    finally:
        conn.close()


# ---------- 孤儿文件 ----------
def test_purge_orphans():
    from app.db import connect
    from app.retention import purge_orphans

    conn = connect()
    fid, cid = _setup_family(conn)
    conn.close()
    _upload(cid, fid)  # 一条有引用

    orphan = MEDIA / str(cid) / "orphan.webm"  # 无引用的半成品
    orphan.write_bytes(b"x" * 1024)

    conn = connect()
    try:
        removed = purge_orphans(conn, MEDIA)
    finally:
        conn.close()

    assert removed == 1
    assert not orphan.exists()
    # 有引用的那条还在
    from app.db import connect as c2
    conn = c2()
    try:
        n = conn.execute("SELECT COUNT(*) AS n FROM recordings").fetchone()["n"]
    finally:
        conn.close()
    assert n == 1
