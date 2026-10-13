#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""kids-english 后端 API（FastAPI）。

环境变量（服务器配置，勿提交到 git）：
  XF_APPID      讯飞开放平台 AppID
  XF_API_KEY    讯飞接口 APIKey
  XF_API_SECRET 讯飞接口 APISecret
"""
import io
import os
import wave

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile

from ise_client import evaluate, parse_result

load_dotenv()  # 从 server/.env 读取讯飞凭据（.env 不入库）

app = FastAPI(title="kids-english api")

REQUIRED_ENV = ("XF_APPID", "XF_API_KEY", "XF_API_SECRET")


def _creds_ready() -> bool:
    return all(os.environ.get(k) for k in REQUIRED_ENV)


@app.get("/api/ping")
def ping():
    return {"ok": True, "msg": "kids-english backend ready"}


@app.post("/api/evaluate")
async def api_evaluate(
    file: UploadFile = File(...),
    text: str = Form(...),
):
    """孩子跟读评测：上传 16k/16bit/单声道 wav（或 raw pcm），返回评分。"""
    if not _creds_ready():
        return {"ok": False, "error": "server_not_configured", "msg": "讯飞凭据未配置"}

    data = await file.read()
    if len(data) < 256:
        return {"ok": False, "error": "audio_too_short", "msg": "音频太短，请大声再说一次"}

    # wav -> pcm（剥离 RIFF 头；raw 则直接用）
    pcm = _to_pcm(data)
    if not pcm:
        return {"ok": False, "error": "audio_bad_format", "msg": "音频格式不支持（需 16k/16bit/单声道 wav 或 pcm）"}

    if len(pcm) > 60 * 16000 * 2:
        return {"ok": False, "error": "audio_too_long", "msg": "音频超过 60 秒"}

    try:
        result = await evaluate(
            pcm,
            text,
            os.environ["XF_APPID"],
            os.environ["XF_API_KEY"],
            os.environ["XF_API_SECRET"],
        )
    except TimeoutError:
        return {"ok": False, "error": "upstream_timeout", "msg": "评测服务超时，请稍后再试"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": "upstream_error", "msg": f"评测失败：{e}"}

    parsed = parse_result(result)
    if parsed.get("ret", 0) != 0:
        return {"ok": False, "error": "upstream_ret", "msg": f"评测异常 ret={parsed.get('ret')}"}
    return {"ok": True, **{k: parsed[k] for k in (
        "total_score", "accuracy_score", "fluency_score", "integrity_score",
        "is_rejected", "except_info", "words",
    )}}


def _to_pcm(data: bytes):
    try:
        if data[:4] == b"RIFF":
            with wave.open(io.BytesIO(data)) as w:
                if (
                    w.getframerate() != 16000
                    or w.getnchannels() != 1
                    or w.getsampwidth() != 2
                ):
                    return None
                return w.readframes(w.getnframes())
    except Exception:  # noqa: BLE001
        pass
    # 没有 RIFF 头：当作 raw pcm（16k/16bit/mono）
    return data
