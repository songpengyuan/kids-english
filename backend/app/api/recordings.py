"""录音资产：孩子发音原音落盘 + 元数据入库，家长可回放（/api/v1/recordings）。

孩子的声音是成长资产：原始录音（webm/wav/ogg/m4a）存本地媒体目录，
SQLite 只存元数据（路径/时长/文本/来源/评测分预留）。回放走家长鉴权。
"""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..db import connect
from .auth import _require_family

router = APIRouter(prefix="/api/v1/children/{child_id}", tags=["recordings"])

# 媒体根目录（测试用 KIDS_MEDIA_ROOT 指向临时目录）
MEDIA_ROOT = Path(
    os.environ.get("KIDS_MEDIA_ROOT", Path(__file__).resolve().parent.parent / "media")
)

_EXT_BY_CTYPE = {
    "audio/webm": ".webm",
    "video/webm": ".webm",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/x-m4a": ".m4a",
}
_KNOWN_EXTS = (".webm", ".wav", ".ogg", ".m4a", ".mp3", ".mp4")


def _child_belongs(conn, child_id: int, family_id: int) -> bool:
    return bool(
        conn.execute(
            "SELECT id FROM children WHERE id=? AND family_id=?", (child_id, family_id)
        ).fetchone()
    )


def _ext_for(filename: str, ctype: str) -> str:
    """按文件名/Content-Type 推断扩展名，未知一律 .webm。"""
    low = (filename or "").lower()
    for ext in _KNOWN_EXTS:
        if low.endswith(ext):
            return ext
    return _EXT_BY_CTYPE.get((ctype or "").split(";")[0].strip().lower(), ".webm")


@router.post("/recordings", status_code=201)
async def create_recording(
    child_id: int,
    family_id: int = Depends(_require_family),
    file: UploadFile = File(...),
    text: str = Form(""),
    activity_type: str = Form("follow"),
    lesson_id: str | None = Form(None),
    duration_ms: int | None = Form(None),
):
    """上传一段孩子发音原音：落盘 + 元数据入库。评测分（scores_json）P2-3 接入时填充。"""
    conn = connect()
    try:
        if not _child_belongs(conn, child_id, family_id):
            raise HTTPException(404, "孩子不存在")
    finally:
        conn.close()

    data = await file.read()
    if len(data) < 256:
        raise HTTPException(400, "音频太短，请大声再说一次")

    ext = _ext_for(file.filename or "", file.content_type or "")
    rel = f"{child_id}/{uuid.uuid4().hex}{ext}"
    path = MEDIA_ROOT / rel
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    except OSError as e:
        raise HTTPException(500, f"音频保存失败：{e}")

    conn = connect()
    try:
        cur = conn.execute(
            """INSERT INTO recordings
               (child_id, lesson_id, activity_type, ref_text, duration_ms, file_path)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (child_id, lesson_id, activity_type, text, duration_ms, str(path)),
        )
        conn.commit()
        rid = cur.lastrowid
    finally:
        conn.close()
    return {"ok": True, "id": rid}


@router.get("/recordings")
def list_recordings(child_id: int, family_id: int = Depends(_require_family)):
    """孩子录音列表（新→旧，最多 200 条；不暴露服务器文件路径）。"""
    conn = connect()
    try:
        if not _child_belongs(conn, child_id, family_id):
            raise HTTPException(404, "孩子不存在")
        rows = conn.execute(
            """SELECT id, lesson_id, activity_type, ref_text, duration_ms,
                      scores_json, created_at
               FROM recordings WHERE child_id=?
               ORDER BY id DESC LIMIT 200""",
            (child_id,),
        ).fetchall()
    finally:
        conn.close()
    data = []
    for r in rows:
        d = dict(r)
        scores = d.pop("scores_json", None)
        if scores:
            import json
            d["scores"] = json.loads(scores)
        data.append(d)
    return {"ok": True, "data": data}


@router.get("/recordings/{rid}/audio")
def replay_audio(
    child_id: int, rid: int, family_id: int = Depends(_require_family)
):
    """回放：流式返回原始录音。仅本家庭可访问。"""
    conn = connect()
    try:
        row = conn.execute(
            "SELECT child_id, file_path FROM recordings WHERE id=?", (rid,)
        ).fetchone()
        if not row or row["child_id"] != child_id:
            raise HTTPException(404, "录音不存在")
        if not _child_belongs(conn, row["child_id"], family_id):
            raise HTTPException(404, "录音不存在")
        path = Path(row["file_path"])
    finally:
        conn.close()
    if not path.exists():
        raise HTTPException(404, "录音不存在")
    return FileResponse(path, media_type=_EXT_BY_CTYPE.get(path.suffix.lower(), "audio/webm"))
