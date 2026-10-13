#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""讯飞语音评测（流式版 ISE）客户端。

接口：wss://ise-api.xfyun.cn/v2/open-ise
签名：HMAC-SHA256（headers="host date request-line"）
音频：16k / 16bit / 单声道 PCM
"""
import asyncio
import base64
import hashlib
import hmac
import json
from email.utils import formatdate

import websockets

HOST = "ise-api.xfyun.cn"
PATH = "/v2/open-ise"
URL = f"wss://{HOST}{PATH}"


def _sign(api_secret: str, date: str) -> str:
    signature_origin = f"host: {HOST}\ndate: {date}\nGET {PATH} HTTP/1.1"
    digest = hmac.new(
        api_secret.encode("utf-8"), signature_origin.encode("utf-8"), hashlib.sha256
    ).digest()
    return base64.b64encode(digest).decode("utf-8")


def build_url(api_key: str, api_secret: str) -> str:
    date = formatdate(timeval=None, localtime=False, usegmt=True)  # RFC1123 GMT
    signature = _sign(api_secret, date)
    authorization_origin = (
        f'api_key="{api_key}", algorithm="hmac-sha256", '
        f'headers="host date request-line", signature="{signature}"'
    )
    authorization = base64.b64encode(authorization_origin.encode("utf-8")).decode("utf-8")
    return f"{URL}?authorization={authorization}&date={date}&host={HOST}"


async def evaluate(
    audio_pcm: bytes,
    text: str,
    app_id: str,
    api_key: str,
    api_secret: str,
    timeout: float = 30.0,
) -> dict:
    """将一段 PCM 音频发送给讯飞做句子跟读评测，返回原始结果 dict。

    Raises:
        TimeoutError: 超时无结果
        RuntimeError: 讯飞返回错误码 / 协议异常
    """
    url = build_url(api_key, api_secret)
    business = {
        "aue": "raw",
        "auf": "audio/L16;rate=16000",
        "category": "read_sentence",
        "cmd": "ssb",
        "ent": "en_vip",  # en_vip=英语评测；cn_vip=中文
        "sub": "ise",
        "text": text,
        "rst": "entirety",  # 完整结果
        "plev": "0",  # 全维度（准确度/流利度/完整度）
    }
    frame_first = {
        "common": {"app_id": app_id},
        "business": business,
        "data": {"status": 0, "data": ""},
    }
    frame_audio = {
        "data": {"status": 2, "data": base64.b64encode(audio_pcm).decode("utf-8")},
        "cmd": "auw",
    }

    async with websockets.connect(url, max_size=None) as ws:
        await ws.send(json.dumps(frame_first))
        await ws.send(json.dumps(frame_audio))
        result = None
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            code = msg.get("code", 0)
            if code != 0:
                raise RuntimeError(
                    f"讯飞评测失败 code={code} sid={msg.get('sid', '')} message={msg.get('message', '')}"
                )
            data = msg.get("data") or {}
            if data.get("status") == 2 and data.get("data"):
                result = json.loads(base64.b64decode(data["data"]))
                break
    return result or {}


def parse_result(result: dict) -> dict:
    """把讯飞原始结果整理成前端友好的结构。

    返回:
      {
        "ret": 0,
        "total_score": 0~100,
        "accuracy_score": 准确度(全维度),
        "fluency_score": 流利度(全维度),
        "integrity_score": 完整度(全维度),
        "is_rejected": bool,      # 是否被拒（乱读）
        "except_info": int,       # 异常码（0 无异常）
        "words": [{"content","score","dp_message"}],
      }
    """
    j = result.get("json", result)
    paper = j.get("rec_paper", j)

    section = None
    for key in ("read_sentence", "read_word", "read_chapter"):
        if isinstance(paper, dict) and key in paper:
            section = paper[key]
            break
    if section is None and isinstance(paper, dict):
        # 兜底：找第一个含 total_score 的节点
        def _find(d):
            if isinstance(d, dict):
                if "total_score" in d:
                    return d
                for v in d.values():
                    r = _find(v)
                    if r is not None:
                        return r
            return None
        section = _find(paper) or {}

    def _num(v):
        try:
            return round(float(v), 1)
        except (TypeError, ValueError):
            return None

    words = []
    sentences = section.get("sentence") if isinstance(section, dict) else None
    if isinstance(sentences, list):
        for sent in sentences:
            for w in sent.get("word", []) if isinstance(sent, dict) else []:
                words.append(
                    {
                        "content": w.get("content", ""),
                        "score": _num(w.get("total_score")),
                        "dp_message": w.get("dp_message", 0),
                    }
                )

    return {
        "ret": result.get("ret", 0),
        "total_score": _num(section.get("total_score")),
        "accuracy_score": _num(section.get("accuracy_score")),
        "fluency_score": _num(section.get("fluency_score")),
        "integrity_score": _num(section.get("integrity_score")),
        "is_rejected": str(section.get("is_rejected", "")).lower() == "true",
        "except_info": section.get("except_info", 0),
        "words": words,
        "raw": result,
    }
