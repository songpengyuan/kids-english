"""评测接口（/api/v1/evaluation）测试：凭据、格式校验、上游异常与正常返回。

讯飞调用被 mock（ise_client 是纯网络客户端，真实调用见部署后真机走查）；
parse_result 用真实实现，保证"接口 → 解析"链路完整。
运行：.venv/bin/pytest tests/test_evaluation.py -q
"""
import io
import os
import struct
import tempfile
import wave
from pathlib import Path

import pytest
from unittest.mock import AsyncMock

# 用临时数据库 + 强测试密钥（必须在 import app 之前设置）。
# 合跑时沿用 test_api.py 已设置的 DB/密钥，避免跨文件污染。
if "KIDS_DB_PATH" not in os.environ:
    _tmp = tempfile.mkdtemp(prefix="kids-eval-test-")
    os.environ["KIDS_DB_PATH"] = str(Path(_tmp) / "test.db")
if "KIDS_JWT_SECRET" not in os.environ:
    os.environ["KIDS_JWT_SECRET"] = "test-secret-" + "k" * 32

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from app.ratelimit import reset as reset_ratelimit  # noqa: E402

client = TestClient(app)

XF_ENVS = ("XF_APPID", "XF_API_KEY", "XF_API_SECRET")


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch):
    """隔离数据 + 默认 mock 讯飞成功，用例内按需覆写。"""
    from app.db import init_db
    from app.seed import seed_lessons

    reset_ratelimit()
    if Path(os.environ["KIDS_DB_PATH"]).exists():
        Path(os.environ["KIDS_DB_PATH"]).unlink()
    init_db()
    seed_lessons()

    # 默认带上测试凭据（未配置场景由用例显式删）
    monkeypatch.setenv("XF_APPID", "test-appid")
    monkeypatch.setenv("XF_API_KEY", "test-api-key")
    monkeypatch.setenv("XF_API_SECRET", "test-api-secret")
    # 默认 mock 评测成功；异常场景由用例覆写
    import app.api.evaluation as ev

    ev.ise_evaluate = AsyncMock(return_value={"ret": 0, "json": _xf_result()})
    yield


def _xf_result(total=92.0, acc=88.0, flu=85.0, integ=95.0):
    """构造一份讯飞 read_sentence 标准返回。"""
    return {
        "rec_paper": {
            "read_sentence": {
                "total_score": total,
                "accuracy_score": acc,
                "fluency_score": flu,
                "integrity_score": integ,
                "is_rejected": "false",
                "except_info": 0,
                "sentence": [{"word": [{"content": "It", "total_score": 95.0}, {"content": "is", "total_score": 90.0}]}],
            }
        }
    }


def _wav_bytes(rate=16000, seconds=1.0):
    """生成 16bit 单声道 wav（带一段简单波形，避免静音）。"""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        n = int(rate * seconds)
        frames = b"".join(struct.pack("<h", int(3000 * __import__("math").sin(2 * __import__("math").pi * 220 * i / rate))) for i in range(n))
        w.writeframes(frames)
    return buf.getvalue()


def _post(payload: bytes = None, text: str = "It is a frog.", wav: bool = True):
    if payload is None:
        payload = _wav_bytes() if wav else b"x" * 128
    files = {"file": ("a.wav", payload, "audio/wav")}
    return client.post("/api/v1/evaluation", files=files, data={"text": text})


def test_missing_creds_returns_server_not_configured(monkeypatch):
    for k in XF_ENVS:
        monkeypatch.delenv(k, raising=False)
    r = _post()
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert body["error"] == "server_not_configured"


def test_audio_too_short():
    r = _post(payload=b"x" * 128)
    assert r.json()["error"] == "audio_too_short"


def test_bad_format_wav_rejected():
    r = _post(payload=_wav_bytes(rate=8000))
    assert r.json()["error"] == "audio_bad_format"


def test_success_returns_scores_and_words():
    r = _post()
    body = r.json()
    assert body["ok"] is True
    assert body["total_score"] == 92.0
    assert body["accuracy_score"] == 88.0
    assert body["fluency_score"] == 85.0
    assert body["integrity_score"] == 95.0
    assert body["is_rejected"] is False
    assert body["words"][0]["content"] == "It"


def test_upstream_timeout():
    import app.api.evaluation as ev

    ev.ise_evaluate = AsyncMock(side_effect=TimeoutError())
    r = _post()
    assert r.json()["error"] == "upstream_timeout"


def test_upstream_error():
    import app.api.evaluation as ev

    ev.ise_evaluate = AsyncMock(side_effect=RuntimeError("boom"))
    r = _post()
    assert r.json()["error"] == "upstream_error"
    assert "boom" in r.json()["msg"]


def test_upstream_ret_nonzero():
    import app.api.evaluation as ev

    ev.ise_evaluate = AsyncMock(return_value={"ret": 10105})
    r = _post()
    body = r.json()
    assert body["ok"] is False
    assert body["error"] == "upstream_ret"
