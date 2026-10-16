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
        assert r.status_code == 201  # REST：创建家庭资源返回 201
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
            "/api/v1/children",
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
            "/api/v1/children",
            headers={"Authorization": f"Bearer {t1}"},
            json={"name": "孩子A"},
        )
        t2 = _auth("别人家", "5678")
        # 家庭2 无权读取家庭1 的孩子
        assert client.get(
            "/api/v1/children/1/progress", headers={"Authorization": f"Bearer {t2}"}
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
            "/api/v1/children",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "程程"},
        )
        put = client.put(
            "/api/v1/children/1/progress",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "data": {"l4": {"learn": 3, "quiz": 2, "completed": ["learn", "quiz"],
                               "words": {"sea": {"seen": 2, "correct": 1}}}},
                "meta": {"_last": "l4", "_daily": {"date": "2026-10-14", "durationSec": 60, "activities": 1, "listenSec": 55}},
            },
        )
        assert put.json()["ok"] is True

        got = client.get(
            "/api/v1/children/1/progress", headers={"Authorization": f"Bearer {token}"}
        ).json()
        assert got["data"]["l4"]["learn"] == 3
        assert got["data"]["l4"]["words"]["sea"]["correct"] == 1
        assert got["meta"]["_last"] == "l4"
        assert got["meta"]["_daily"]["activities"] == 1
        assert got["meta"]["_daily"]["listenSec"] == 55  # 磨耳朵时长须随 _daily 持久化

    def test_daily_listensec_merge_takes_max(self):
        token = _auth()
        client.post(
            "/api/v1/children",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "程程"},
        )
        # 第一次上报 30s，第二次上报 45s（同日期）→ 应保留较大值
        for sec in (30, 45):
            r = client.put(
                "/api/v1/children/1/progress",
                headers={"Authorization": f"Bearer {token}"},
                json={"data": {}, "meta": {"_daily": {"date": "2026-10-14", "durationSec": 10, "activities": 1, "listenSec": sec}}},
            )
            assert r.json()["ok"] is True
        got = client.get(
            "/api/v1/children/1/progress", headers={"Authorization": f"Bearer {token}"}
        ).json()
        assert got["meta"]["_daily"]["listenSec"] == 45

    def test_put_overwrite_same_lesson(self):
        token = _auth()
        client.post(
            "/api/v1/children",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "程程"},
        )
        for stars in (1, 3):
            client.put(
                "/api/v1/children/1/progress",
                headers={"Authorization": f"Bearer {token}"},
                json={"data": {"l4": {"learn": stars}}},
            )
        got = client.get(
            "/api/v1/children/1/progress", headers={"Authorization": f"Bearer {token}"}
        ).json()
        assert got["data"]["l4"]["learn"] == 3  # 合并语义：星级取 max


class TestLegacy:
    def test_ping(self):
        assert client.get("/api/ping").json()["ok"] is True

    def test_legacy_evaluate_unchanged(self, monkeypatch):
        # 旧前端路径保留：无凭据时返回 server_not_configured（契约不变）
        for k in ("XF_APPID", "XF_API_KEY", "XF_API_SECRET"):
            monkeypatch.delenv(k, raising=False)
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


class TestAccountStorage:
    """账号数据存储（免费模式地基）：email 唯一、邮箱/家庭名双通道登录、资料读取与编辑。"""

    def test_register_with_email_and_me_returns_full_profile(self):
        token = _register_with_email("邮箱家", "a@b.com")
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
        assert me["email"] == "a@b.com"
        assert me["nickname"] == "邮箱家"  # 未设昵称时默认=家庭名
        assert me["created_at"]  # 注册时间已落库

    def test_duplicate_email_409(self):
        _register_with_email("邮箱家", "a@b.com")
        r = client.post(
            "/api/v1/auth/register",
            json={"family_name": "另一个家", "passcode": "1234", "email": "a@b.com"},
        )
        assert r.status_code == 409
        assert "邮箱" in r.json()["detail"]

    def test_email_case_insensitive_unique(self):
        _register_with_email("邮箱家", "Ab@b.com")
        # 大写变体视为同一邮箱 → 409（归一化）
        r = client.post(
            "/api/v1/auth/register",
            json={"family_name": "另一个家", "passcode": "1234", "email": "ab@b.com"},
        )
        assert r.status_code == 409

    def test_login_by_email(self):
        _register_with_email("邮箱家", "a@b.com")
        login = client.post(
            "/api/v1/auth/login", json={"email": "a@b.com", "passcode": "1234"}
        ).json()
        assert login["ok"] is True
        assert login["email"] == "a@b.com"

    def test_login_by_family_name_still_works(self):
        """存量兼容：无邮箱的家庭名账号照常登录。"""
        _register("旧家")
        login = client.post(
            "/api/v1/auth/login", json={"family_name": "旧家", "passcode": "1234"}
        ).json()
        assert login["ok"] is True
        assert login["email"] is None

    def test_login_without_identifier_400(self):
        r = client.post("/api/v1/auth/login", json={"passcode": "1234"})
        assert r.status_code == 400

    def test_patch_me_updates_nickname_and_email(self):
        token = _auth()
        r = client.patch(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            json={"nickname": "程程爸", "email": "new@b.com"},
        )
        assert r.status_code == 200
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
        assert me["nickname"] == "程程爸"
        assert me["email"] == "new@b.com"

    def test_patch_me_email_conflict_409(self):
        _register_with_email("家A", "a@b.com")
        token = _register_with_email("家B", "b@b.com")
        r = client.patch(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            json={"email": "a@b.com"},
        )
        assert r.status_code == 409

    def test_register_without_email_ok(self):
        """存量路径：不填邮箱仍可注册（email 可空）。"""
        token = _register("无邮箱家").json()["token"]  # _register 返回 Response，须取 token
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
        assert me["email"] is None


def _register_with_email(name, email, passcode="1234"):
    r = client.post(
        "/api/v1/auth/register",
        json={"family_name": name, "passcode": passcode, "email": email},
    )
    assert r.status_code == 201, r.text  # REST：注册=创建家庭 → 201
    return r.json()["token"]


def _make_child(token, name="程程", avatar="🐰", birth_date="2022-03-15"):
    r = client.post(
        "/api/v1/children",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": name, "avatar": avatar, "birth_date": birth_date},
    )
    assert r.status_code == 201, r.text  # REST：创建孩子 → 201
    return r.json()["child"]["id"]


class TestChildProfile:
    """孩子档案个性化：birth_date + PATCH 编辑（名/头像/生日）。"""

    def test_create_child_with_birth_date_in_me(self):
        token = _auth()
        _make_child(token)
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
        child = me["children"][0]
        assert child["name"] == "程程"
        assert child["avatar"] == "🐰"
        assert child["birth_date"] == "2022-03-15"

    def test_create_child_without_birth_date_ok(self):
        """存量路径：不填生日仍可建孩子（birth_date 可空）。"""
        token = _auth()
        r = client.post(
            "/api/v1/children",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "朵朵"},
        )
        assert r.status_code == 201
        assert r.json()["child"]["birth_date"] is None

    def test_patch_child_name_avatar_birth(self):
        token = _auth()
        cid = _make_child(token)
        r = client.patch(
            f"/api/v1/children/{cid}",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "程程宝", "avatar": "🦁", "birth_date": "2022-06-01"},
        )
        assert r.status_code == 200
        child = r.json()["child"]
        assert child["name"] == "程程宝"
        assert child["avatar"] == "🦁"
        assert child["birth_date"] == "2022-06-01"

    def test_patch_child_partial_only_name(self):
        token = _auth()
        cid = _make_child(token)
        r = client.patch(
            f"/api/v1/children/{cid}",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "程程宝"},
        )
        assert r.status_code == 200
        child = r.json()["child"]
        assert child["name"] == "程程宝"
        assert child["avatar"] == "🐰"  # 未提交字段保留原值
        assert child["birth_date"] == "2022-03-15"

    def test_patch_child_clear_avatar(self):
        """显式传 null 清除头像（PATCH 语义：缺席=不改，null=清空）。"""
        token = _auth()
        cid = _make_child(token)
        r = client.patch(
            f"/api/v1/children/{cid}",
            headers={"Authorization": f"Bearer {token}"},
            json={"avatar": None},
        )
        assert r.status_code == 200
        assert r.json()["child"]["avatar"] is None

    def test_patch_child_nothing_400(self):
        token = _auth()
        cid = _make_child(token)
        r = client.patch(
            f"/api/v1/children/{cid}",
            headers={"Authorization": f"Bearer {token}"},
            json={},
        )
        assert r.status_code == 400

    def test_patch_other_family_child_404(self):
        token = _auth()
        cid = _make_child(token)
        t2 = _auth("别人家", "5678")
        assert client.patch(
            f"/api/v1/children/{cid}",
            headers={"Authorization": f"Bearer {t2}"},
            json={"name": "抢"},
        ).status_code == 404


class TestRewards:
    """奖励数据上云：贝壳/形态星级/开箱次数按孩子存取（换设备不丢）。"""

    def test_get_empty_rewards(self):
        token = _auth()
        cid = _make_child(token)
        got = client.get(
            f"/api/v1/children/{cid}/rewards", headers={"Authorization": f"Bearer {token}"}
        ).json()
        assert got["ok"] is True
        assert got["data"] == {"shells": 0, "forms": {}, "chestsOpened": 0}

    def test_put_then_get_roundtrip(self):
        token = _auth()
        cid = _make_child(token)
        put = client.put(
            f"/api/v1/children/{cid}/rewards",
            headers={"Authorization": f"Bearer {token}"},
            json={"shells": 42, "forms": {"leo": 2, "doli": 1}, "chestsOpened": 9},
        )
        assert put.json()["ok"] is True
        got = client.get(
            f"/api/v1/children/{cid}/rewards", headers={"Authorization": f"Bearer {token}"}
        ).json()
        assert got["data"]["shells"] == 42
        assert got["data"]["forms"]["leo"] == 2
        assert got["data"]["chestsOpened"] == 9
        assert got["updated_at"]

    def test_put_overwrite_latest(self):
        token = _auth()
        cid = _make_child(token)
        for shells in (10, 20):
            client.put(
                f"/api/v1/children/{cid}/rewards",
                headers={"Authorization": f"Bearer {token}"},
                json={"shells": shells, "forms": {}, "chestsOpened": 0},
            )
        got = client.get(
            f"/api/v1/children/{cid}/rewards", headers={"Authorization": f"Bearer {token}"}
        ).json()
        assert got["data"]["shells"] == 20  # 覆盖写入，取最后一次

    def test_cross_family_rewards_404(self):
        token = _auth()
        cid = _make_child(token)
        t2 = _auth("别人家", "5678")
        assert client.get(
            f"/api/v1/children/{cid}/rewards", headers={"Authorization": f"Bearer {t2}"}
        ).status_code == 404
        assert client.put(
            f"/api/v1/children/{cid}/rewards",
            headers={"Authorization": f"Bearer {t2}"},
            json={"shells": 1, "forms": {}, "chestsOpened": 0},
        ).status_code == 404

    def test_negative_shells_422(self):
        token = _auth()
        cid = _make_child(token)
        r = client.put(
            f"/api/v1/children/{cid}/rewards",
            headers={"Authorization": f"Bearer {token}"},
            json={"shells": -1, "forms": {}, "chestsOpened": 0},
        )
        assert r.status_code == 422


class TestConcurrency:
    """多设备并发：双端各玩各的，云端合并写不丢任何一端的数据。

    儿童场景数据"只增不减"：星级/计数取 max、玩过列表取并集、
    单词逐词合并（计数 max + lastAt 取较新）、贝壳取 max。
    """

    def _child(self, token):
        return _make_child(token)

    def _put(self, token, cid, data=None, meta=None):
        r = client.put(
            f"/api/v1/children/{cid}/progress",
            headers={"Authorization": f"Bearer {token}"},
            json={"data": data or {}, "meta": meta},
        )
        assert r.status_code == 200, r.text

    def _get(self, token, cid):
        return client.get(
            f"/api/v1/children/{cid}/progress", headers={"Authorization": f"Bearer {token}"}
        ).json()

    def test_two_devices_different_lessons_both_kept(self):
        token = _auth()
        cid = self._child(token)
        # 手机：学了 l4；iPad：学了 l5 —— 两端上报互不覆盖
        self._put(token, cid, {"l4": {"learn": 3, "completed": ["learn"]}})
        self._put(token, cid, {"l5": {"quiz": 2, "completed": ["quiz"]}})
        got = self._get(token, cid)
        assert got["data"]["l4"]["learn"] == 3
        assert got["data"]["l5"]["quiz"] == 2

    def test_same_lesson_stars_take_max(self):
        token = _auth()
        cid = self._child(token)
        self._put(token, cid, {"l4": {"learn": 2, "quiz": 1}})
        self._put(token, cid, {"l4": {"learn": 3}})  # 另一端更高
        got = self._get(token, cid)
        assert got["data"]["l4"]["learn"] == 3  # max
        assert got["data"]["l4"]["quiz"] == 1  # 未上报的字段保留

    def test_completed_union(self):
        token = _auth()
        cid = self._child(token)
        self._put(token, cid, {"l4": {"completed": ["learn"]}})
        self._put(token, cid, {"l4": {"completed": ["quiz", "match"]}})
        got = self._get(token, cid)
        assert sorted(got["data"]["l4"]["completed"]) == ["learn", "match", "quiz"]

    def test_words_merge_per_word(self):
        token = _auth()
        cid = self._child(token)
        self._put(token, cid, {"l4": {"words": {"sea": {"seen": 2, "correct": 1, "wrong": 1}}}})
        self._put(token, cid, {"l4": {"words": {"sun": {"seen": 1}, "sea": {"correct": 3, "lastAt": 900}}}})
        got = self._get(token, cid)
        words = got["data"]["l4"]["words"]
        assert words["sun"]["seen"] == 1          # 另一端新词补入
        assert words["sea"]["seen"] == 2          # 计数取 max
        assert words["sea"]["correct"] == 3       # 计数取 max
        assert words["sea"]["wrong"] == 1         # 另一端未动保留
        assert words["sea"]["lastAt"] == 900      # 较新的 lastAt 保留

    def test_rewards_merge_take_max(self):
        token = _auth()
        cid = self._child(token)
        client.put(
            f"/api/v1/children/{cid}/rewards",
            headers={"Authorization": f"Bearer {token}"},
            json={"shells": 42, "forms": {"leo": 2}, "chestsOpened": 9},
        )
        client.put(
            f"/api/v1/children/{cid}/rewards",
            headers={"Authorization": f"Bearer {token}"},
            json={"shells": 10, "forms": {"leo": 1, "bun": 3}, "chestsOpened": 2},
        )
        got = client.get(
            f"/api/v1/children/{cid}/rewards", headers={"Authorization": f"Bearer {token}"}
        ).json()["data"]
        assert got["shells"] == 42      # max
        assert got["forms"]["leo"] == 2  # max
        assert got["forms"]["bun"] == 3  # 另一端独有补入
        assert got["chestsOpened"] == 9  # max

    def test_meta_daily_log_merge(self):
        token = _auth()
        cid = self._child(token)
        self._put(token, cid, {}, meta={"_daily": {"date": "2026-10-15", "durationSec": 60, "activities": 1}})
        self._put(token, cid, {}, meta={"_dailyLog": {"2026-10-14": {"durationSec": 30, "activities": 1, "mastered": 2}}})
        got = self._get(token, cid)
        assert got["meta"]["_daily"]["date"] == "2026-10-15"
        assert got["meta"]["_dailyLog"]["2026-10-14"]["durationSec"] == 30
