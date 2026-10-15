"""后端 API 冒烟测试（真实实现 + TestClient）。

覆盖 P0 全链路：注册 → 登录 → 孩子 → 内容 → 进度 → 认证/越权防护。
运行：server/.venv/bin/pytest tests/ -q（需要 pytest 依赖）。
"""
import os
import tempfile
from pathlib import Path

import pytest

# 用临时数据库，避免污染真实数据（必须在 import app 之前设置）
_tmp = tempfile.mkdtemp(prefix="kids-test-")
os.environ["KIDS_DB_PATH"] = str(Path(_tmp) / "test.db")
# 测试用强密钥（生产由 assert_secret_configured 强制 ≥32 位）
os.environ["KIDS_JWT_SECRET"] = "test-secret-" + "k" * 32

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from app.ratelimit import reset as reset_ratelimit  # noqa: E402
from app.security import assert_secret_configured  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def fresh_db():
    """每个用例前重建数据库 + 重新 seed + 清限流计数（隔离用例间数据）。"""
    from app.db import init_db
    from app.seed import seed_lessons

    reset_ratelimit()
    if Path(os.environ["KIDS_DB_PATH"]).exists():
        Path(os.environ["KIDS_DB_PATH"]).unlink()
    init_db()
    seed_lessons()
    yield


def _register(name="测试家", passcode="1234"):
    return client.post("/api/v1/auth/register", json={"family_name": name, "passcode": passcode})


def _auth(name="测试家", passcode="1234"):
    """确保家庭存在后返回 token（每用例重建空库，未注册先注册）。"""
    r = client.post("/api/v1/auth/login", json={"family_name": name, "passcode": passcode})
    if r.status_code == 401:
        client.post("/api/v1/auth/register", json={"family_name": name, "passcode": passcode})
        r = client.post("/api/v1/auth/login", json={"family_name": name, "passcode": passcode})
    return r.json()["token"]


class TestAuth:
    def test_register_then_login(self):
        r = _register()
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["token"]

        login = client.post(
            "/api/v1/auth/login",
            json={"family_name": "测试家", "passcode": "1234"},
        )
        assert login.json()["ok"] is True
        assert login.json()["children"] == []

    def test_register_duplicate_name_409(self):
        _register()
        assert _register().status_code == 409

    def test_wrong_passcode_401(self):
        _register()
        r = client.post("/api/v1/auth/login", json={"family_name": "测试家", "passcode": "9999"})
        assert r.status_code == 401

    def test_me_requires_token(self):
        assert client.get("/api/v1/auth/me").status_code == 401
        assert client.get("/api/v1/content/lessons").status_code == 401


class TestChildren:
    def test_create_child_and_me(self):
        token = _auth()
        r = client.post(
            "/api/v1/auth/children",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "程程", "avatar": "🐰"},
        )
        assert r.json()["child"]["id"] == 1

        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
        assert len(me["children"]) == 1
        assert me["children"][0]["name"] == "程程"

    def test_cross_family_cannot_access_child(self):
        t1 = _auth()
        client.post(
            "/api/v1/auth/children",
            headers={"Authorization": f"Bearer {t1}"},
            json={"name": "孩子A"},
        )
        t2 = _auth("别人家", "5678")
        # 家庭2 无权读取家庭1 的孩子
        assert client.get(
            "/api/v1/progress/child/1", headers={"Authorization": f"Bearer {t2}"}
        ).status_code == 404


class TestContent:
    def test_lessons_seeded(self):
        token = _auth()
        r = client.get("/api/v1/content/lessons", headers={"Authorization": f"Bearer {token}"}).json()
        assert r["ok"] is True
        ids = [l["id"] for l in r["lessons"]]
        assert "l4" in ids  # seed 至少含现有课程

    def test_lesson_detail_full(self):
        token = _auth()
        r = client.get("/api/v1/content/lessons/l4", headers={"Authorization": f"Bearer {token}"}).json()
        assert r["ok"] is True
        lesson = r["lesson"]
        assert lesson["id"] == "l4"
        assert len(lesson["words"]) > 0
        assert lesson["song"]["lyrics"]
        assert lesson["song"]["timings"] is not None  # 时间轴已随 seed 入库

    def test_lesson_not_found_404(self):
        token = _auth()
        assert client.get(
            "/api/v1/content/lessons/zzz", headers={"Authorization": f"Bearer {token}"}
        ).status_code == 404


class TestProgress:
    def test_put_then_get_roundtrip(self):
        token = _auth()
        client.post(
            "/api/v1/auth/children",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "程程"},
        )
        put = client.put(
            "/api/v1/progress/child/1",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "data": {"l4": {"learn": 3, "quiz": 2, "completed": ["learn", "quiz"],
                               "words": {"sea": {"seen": 2, "correct": 1}}}},
                "meta": {"_last": "l4", "_daily": {"date": "2026-10-14", "durationSec": 60, "activities": 1}},
            },
        )
        assert put.json()["ok"] is True

        got = client.get(
            "/api/v1/progress/child/1", headers={"Authorization": f"Bearer {token}"}
        ).json()
        assert got["data"]["l4"]["learn"] == 3
        assert got["data"]["l4"]["words"]["sea"]["correct"] == 1
        assert got["meta"]["_last"] == "l4"
        assert got["meta"]["_daily"]["activities"] == 1

    def test_put_overwrite_same_lesson(self):
        token = _auth()
        client.post(
            "/api/v1/auth/children",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "程程"},
        )
        for stars in (1, 3):
            client.put(
                "/api/v1/progress/child/1",
                headers={"Authorization": f"Bearer {token}"},
                json={"data": {"l4": {"learn": stars}}},
            )
        got = client.get(
            "/api/v1/progress/child/1", headers={"Authorization": f"Bearer {token}"}
        ).json()
        assert got["data"]["l4"]["learn"] == 3  # 覆盖写入，取最后一次


class TestLegacy:
    def test_ping(self):
        assert client.get("/api/ping").json()["ok"] is True

    def test_legacy_evaluate_unchanged(self):
        # 旧前端路径保留：无凭据时返回 server_not_configured（契约不变）
        r = client.post("/api/evaluate", files={"file": ("x.wav", b"\x00" * 300, "audio/wav")}, data={"text": "hello"})
        assert r.json() == {"ok": False, "error": "server_not_configured", "msg": "讯飞凭据未配置"}


class TestHardening:
    def test_login_rate_limited_429(self):
        """登录限流：同一 IP 1 分钟内超 10 次 → 429（防暴力试口令）。"""
        reset_ratelimit()
        for _ in range(10):
            client.post("/api/v1/auth/login", json={"family_name": "nobody", "passcode": "0000"})
        r = client.post("/api/v1/auth/login", json={"family_name": "nobody", "passcode": "0000"})
        assert r.status_code == 429
        assert r.json()["error"] == "too_many_requests"
        reset_ratelimit()  # 不影响后续用例

    def test_secret_required_for_startup(self, monkeypatch):
        """启动安全闸门：缺失/默认值/过短 → 拒绝启动；强密钥放行。"""
        monkeypatch.delenv("KIDS_JWT_SECRET", raising=False)
        with pytest.raises(RuntimeError, match="KIDS_JWT_SECRET"):
            assert_secret_configured()
        monkeypatch.setenv("KIDS_JWT_SECRET", "dev-secret-change-me")
        with pytest.raises(RuntimeError, match="KIDS_JWT_SECRET"):
            assert_secret_configured()
        monkeypatch.setenv("KIDS_JWT_SECRET", "short")
        with pytest.raises(RuntimeError, match="KIDS_JWT_SECRET"):
            assert_secret_configured()
        monkeypatch.setenv("KIDS_JWT_SECRET", "s" * 32)
        assert_secret_configured()  # 不抛
        monkeypatch.setenv("KIDS_JWT_SECRET", "test-secret-" + "k" * 32)
