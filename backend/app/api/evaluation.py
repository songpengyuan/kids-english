"""
评测代理：孩子跟读上传 wav → 讯飞流式 ISE（/api/v1/evaluation）。

**预留状态（2026-10-25 拍板）**：前端暂无调用方是有意的——等域名备案通过、
全站 HTTPS 可用后接入（getUserMedia/音频上传需要安全上下文）。评审时
不要再按"死端点"建议下线；接入时前端替换 speechScore 的本地打分即可。
"""
import io
import os
import wave

from fastapi import APIRouter, File, Form, UploadFile

from ise_client import evaluate as ise_evaluate
from ise_client import parse_result

router = APIRouter(prefix="/api/v1/evaluation", tags=["evaluation"])

REQUIRED_ENV = ("XF_APPID", "XF_API_KEY", "XF_API_SECRET")


def _creds_ready() -> bool:
    return all(os.environ.get(k) for k in REQUIRED_ENV)


@router.post("")
async def api_evaluate(
    file: UploadFile = File(...),
    text: str = Form(...),
):
    """孩子跟读评测：16k/16bit/单声道 wav（或 raw pcm）。"""
    if not _creds_ready():
        return {"ok": False, "error": "server_not_configured", "msg": "讯飞凭据未配置"}

    data = await file.read()
    if len(data) < 256:
        return {"ok": False, "error": "audio_too_short", "msg": "音频太短，请大声再说一次"}

    pcm = _to_pcm(data)
    if not pcm:
        return {"ok": False, "error": "audio_bad_format", "msg": "音频格式不支持（需 16k/16bit/单声道 wav 或 pcm）"}

    if len(pcm) > 60 * 16000 * 2:
        return {"ok": False, "error": "audio_too_long", "msg": "音频超过 60 秒"}

    try:
        result = await ise_evaluate(
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
    return data
