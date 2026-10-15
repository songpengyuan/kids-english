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
from urllib.parse import quote_plus

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
    # date 为 RFC1123（含空格/逗号），必须 URL 编码，否则网关 400
    return (
        f"{URL}?authorization={quote_plus(authorization, safe='')}"
        f"&date={quote_plus(date, safe='')}&host={HOST}"
    )


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
        "sub": "ise",
        "ent": "en_vip",  # en_vip=英语评测；cn_vip=中文
        "category": "read_sentence",
        "cmd": "ssb",  # 参数上传阶段
        "text": "\ufeff" + text,  # 待评测文本需加 UTF-8 BOM
        "tte": "utf-8",
        "ttp_skip": True,  # 跳过 ttp 阶段，直接用 text 评测
        "aue": "raw",
        "auf": "audio/L16;rate=16000",
        "rst": "entirety",  # 完整结果
        "plev": "0",  # 全维度（准确度/流利度/完整度）
    }
    frame_first = {
        "common": {"app_id": app_id},
        "business": business,
        "data": {"status": 0, "data": ""},
    }
    # 音频分帧：cmd/aus 属于 business（每帧携带）；每帧 raw ≤19200B（base64 ≤26000）
    chunk = 8000  # 原始 PCM 字节/帧 → base64 约 10668，安全余量充足
    audio_frames = []
    for i in range(0, len(audio_pcm), chunk):
        piece = audio_pcm[i : i + chunk]
        first = i == 0
        last = i + chunk >= len(audio_pcm)
        audio_frames.append(
            {
                "business": {
                    **business,
                    "cmd": "auw",  # 音频上传阶段
                    "aus": 4 if last else (1 if first else 2),  # 1 首帧 / 2 中间 / 4 末帧
                },
                "data": {
                    "status": 2 if last else 1,
                    "data": base64.b64encode(piece).decode("utf-8"),
                },
            }
        )

    async with websockets.connect(url, max_size=None) as ws:
        await ws.send(json.dumps(frame_first))
        for frame in audio_frames:
            await ws.send(json.dumps(frame))
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
                decoded = base64.b64decode(data["data"]).decode("utf-8", "replace").strip()
                if decoded.startswith("<"):
                    result = {"ret": 0, "xml": decoded}
                else:
                    try:
                        result = {"ret": 0, "json": json.loads(decoded)}
                    except json.JSONDecodeError:
                        result = {"ret": 0, "xml": decoded}
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
    # ---- XML 结果（讯飞 ISE 真实返回：xml_result/read_sentence/rec_paper/read_chapter） ----
    xml_text = result.get("xml") if isinstance(result, dict) else None
    if xml_text:
        import xml.etree.ElementTree as ET

        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            return {"ret": 0, "total_score": None, "accuracy_score": None,
                    "fluency_score": None, "integrity_score": None,
                    "is_rejected": False, "except_info": 0, "words": [], "raw": result}
        chapter = root.find(".//read_chapter") or root.find(".//sentence")
        if chapter is None:
            chapter = root.find(".//read_word") or root.find(".//word")

        def _num(v):
            try:
                return round(float(v) * 20.0, 1)  # 讯飞 0-5 分制 → 0-100
            except (TypeError, ValueError):
                return None

        words = []
        for w in root.findall(".//word"):
            words.append({
                "content": w.get("content", ""),
                "score": _num(w.get("total_score")),
                "dp_message": w.get("dp_message", 0),
            })
        return {
            "ret": result.get("ret", 0),
            "total_score": _num(chapter.get("total_score")) if chapter is not None else None,
            "accuracy_score": _num(chapter.get("accuracy_score")) if chapter is not None else None,
            "fluency_score": _num(chapter.get("fluency_score")) if chapter is not None else None,
            "integrity_score": _num(chapter.get("integrity_score")) if chapter is not None else None,
            "is_rejected": str(chapter.get("is_rejected", "")).lower() == "true" if chapter is not None else False,
            "except_info": int(chapter.get("except_info", 0) or 0) if chapter is not None else 0,
            "words": words,
            "raw": result,
        }

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
