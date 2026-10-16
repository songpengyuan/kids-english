"""录音资产：孩子发音原音落盘 + 元数据入库，家长可回放（/api/v1/recordings）。

孩子的声音是成长资产：原始录音（webm/wav/ogg/m4a）存本地媒体目录，
SQLite 只存元数据（路径/时长/文本/来源/评测分预留）。回放走家长鉴权。

生命周期与边界（ADR-005）：
- 单条硬上限 ``MAX_UPLOAD_BYTES``（默认 5MB）：**在读文件前**按 Content-Length 拒绝，
  读入过程中再按累计字节兜底（Content-Length 可能缺失或被谎报）。
  单 worker 架构下一次超大上传即可拖垮进程或打满磁盘，这里是必要防线。
- 单孩子配额：条数 + 容量双上限，超限一律 429。
- ``file_path`` 存**相对路径**（``<child_id>/<uuid>.ext``），读时与 ``MEDIA_ROOT`` 拼接；
  同时兼容历史的**绝对路径**（媒体根迁移到 OSS / 灾备恢复到不同路径后，历史行仍可用）。
"""
import io
import json
import os
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from ..db import connect
from ._common import child_belongs as _child_belongs
from .auth import _require_family

router = APIRouter(prefix="/api/v1/children/{child_id}", tags=["recordings"])

# 媒体根目录（测试用 KIDS_MEDIA_ROOT 指向临时目录）
MEDIA_ROOT = Path(
    os.environ.get("KIDS_MEDIA_ROOT", Path(__file__).resolve().parent.parent / "media")
)

# ---- 上传边界（ADR-005，均可经环境变量覆盖便于测试）----
MAX_UPLOAD_BYTES = int(os.environ.get("KIDS_MAX_UPLOAD_BYTES", 5 * 1024 * 1024))
MAX_RECORDINGS_PER_CHILD = int(os.environ.get("KIDS_MAX_RECORDINGS_PER_CHILD", 200))
MAX_BYTES_PER_CHILD = int(os.environ.get("KIDS_MAX_BYTES_PER_CHILD", 200 * 1024 * 1024))
_CHUNK = 64 * 1024  # 流式读取块大小，避免整份读进内存

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


def _resolve_media(stored: str) -> Path:
    """``file_path`` → 真实路径。

    新数据存相对路径；历史数据可能是绝对路径。空白值（音频已过保留期被清理）返回
    一个必然不存在的路径，交由调用方按"无音频"处理。
    """
    if not stored:
        return MEDIA_ROOT / "__purged__"
    p = Path(stored)
    return p if p.is_absolute() else MEDIA_ROOT / p


def _child_media_bytes(child_id: int) -> int:
    """该孩子媒体目录的当前占用字节数（用于容量配额）。"""
    d = MEDIA_ROOT / str(child_id)
    if not d.is_dir():
        return 0
    total = 0
    for f in d.iterdir():
        if f.is_file():
            try:
                total += f.stat().st_size
            except OSError:
                pass
    return total


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
    request: Request,
    family_id: int = Depends(_require_family),
    file: UploadFile = File(...),
    text: str = Form(""),
    activity_type: str = Form("follow"),
    lesson_id: str | None = Form(None),
    duration_ms: int | None = Form(None),
):
    """上传一段孩子发音原音：落盘 + 元数据入库。评测分（scores_json）P2-3 接入时填充。

    边界（ADR-005）：单条 ≤5MB（超限 413）、单孩子 ≤200 条 / ≤200MB（超限 429）。
    """
    conn = connect()
    try:
        if not _child_belongs(conn, child_id, family_id):
            raise HTTPException(404, "孩子不存在")
        n = conn.execute(
            "SELECT COUNT(*) AS n FROM recordings WHERE child_id=?", (child_id,)
        ).fetchone()["n"]
        if n >= MAX_RECORDINGS_PER_CHILD:
            raise HTTPException(
                429, f"录音条数已达上限（{MAX_RECORDINGS_PER_CHILD} 条），请在家长中心清理后再试"
            )
    finally:
        conn.close()

    # 大小预检：能在读文件前拒绝，就绝不读文件（不然内存就是缓冲）
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"录音文件过大（上限 {MAX_UPLOAD_BYTES // (1024 * 1024)}MB）")

    if _child_media_bytes(child_id) >= MAX_BYTES_PER_CHILD:
        raise HTTPException(429, "录音存储空间已达上限，请在家长中心清理后再试")

    ext = _ext_for(file.filename or "", file.content_type or "")
    rel = f"{child_id}/{uuid.uuid4().hex}{ext}"  # 入库用相对路径
    path = MEDIA_ROOT / rel
    total = 0
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as fh:
            while True:
                chunk = await file.read(_CHUNK)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:  # Content-Length 缺失/被谎报时的兜底
                    raise HTTPException(
                        413, f"录音文件过大（上限 {MAX_UPLOAD_BYTES // (1024 * 1024)}MB）"
                    )
                fh.write(chunk)
    except HTTPException:
        path.unlink(missing_ok=True)  # 不留半成品
        raise
    except OSError as e:
        path.unlink(missing_ok=True)
        raise HTTPException(500, f"音频保存失败：{e}")

    if total < 256:
        path.unlink(missing_ok=True)
        raise HTTPException(400, "音频太短，请大声再说一次")

    # 写入后再核一次容量：防「最后一条把配额顶破」
    if _child_media_bytes(child_id) > MAX_BYTES_PER_CHILD:
        path.unlink(missing_ok=True)
        raise HTTPException(429, "录音存储空间已达上限，请在家长中心清理后再试")

    conn = connect()
    try:
        cur = conn.execute(
            """INSERT INTO recordings
               (child_id, lesson_id, activity_type, ref_text, duration_ms, file_path)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (child_id, lesson_id, activity_type, text, duration_ms, rel),
        )
        conn.commit()
        rid = cur.lastrowid
    finally:
        conn.close()
    return {"ok": True, "id": rid}


@router.get("/recordings")
def list_recordings(child_id: int, family_id: int = Depends(_require_family)):
    """孩子录音列表（新→旧，最多 200 条；不暴露服务器文件路径）。

    ``has_audio`` 告诉前端这条还有没有音频 —— 过保留期后被清理的记录**仍在列表里**
    （分数与文本保留），但不能再播放。UI 应显示"音频已过保留期"而不是报错
    （ADR-005：否则会表现为"点播放没反应"这种最差的失败形态）。
    """
    conn = connect()
    try:
        if not _child_belongs(conn, child_id, family_id):
            raise HTTPException(404, "孩子不存在")
        rows = conn.execute(
            """SELECT id, lesson_id, activity_type, ref_text, duration_ms,
                      scores_json, created_at,
                      CASE WHEN file_path != '' THEN 1 ELSE 0 END AS has_audio
               FROM recordings WHERE child_id=?
               ORDER BY id DESC LIMIT 200""",
            (child_id,),
        ).fetchall()
    finally:
        conn.close()
    data = []
    for r in rows:
        d = dict(r)
        d["has_audio"] = bool(d.pop("has_audio", 0))
        scores = d.pop("scores_json", None)
        if scores:
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
        path = _resolve_media(row["file_path"])
    finally:
        conn.close()
    if not path.exists():
        raise HTTPException(404, "录音不存在")
    return FileResponse(path, media_type=_EXT_BY_CTYPE.get(path.suffix.lower(), "audio/webm"))


@router.delete("/recordings/{rid}")
def delete_recording(
    child_id: int, rid: int, family_id: int = Depends(_require_family)
):
    """删除单条录音（音频文件 + 行）。归属校验同回放，跨家庭一律 404。

    先删行、后删文件：即便文件删除失败，也不会留下"指向已删行的文件引用"
    （游离文件由 retention.purge_orphans 兜底清理）。
    """
    conn = connect()
    try:
        row = conn.execute(
            "SELECT child_id, file_path FROM recordings WHERE id=?", (rid,)
        ).fetchone()
        if not row or row["child_id"] != child_id:
            raise HTTPException(404, "录音不存在")
        if not _child_belongs(conn, row["child_id"], family_id):
            raise HTTPException(404, "录音不存在")
        stored = row["file_path"]
        conn.execute("DELETE FROM recordings WHERE id=?", (rid,))
        conn.commit()
    finally:
        conn.close()
    if stored:
        try:
            _resolve_media(stored).unlink(missing_ok=True)
        except OSError:
            pass
    return {"ok": True}


@router.get("/recordings/export")
def export_recordings(child_id: int, family_id: int = Depends(_require_family)):
    """打包导出该孩子的录音（zip：``audio/`` + ``recordings.json``）。

    家长数据主权：家长随时能拿回自己孩子的数据。
    已过保留期（音频被清理）的记录仍会出现在 ``recordings.json`` 里，
    只是 ``audio`` 字段为 null —— 导出的是"记录 + 现存音频"，不掩盖事实。
    """
    conn = connect()
    try:
        if not _child_belongs(conn, child_id, family_id):
            raise HTTPException(404, "孩子不存在")
        rows = conn.execute(
            """SELECT id, lesson_id, activity_type, ref_text, duration_ms, scores_json,
                      file_path, created_at, purged_at
               FROM recordings WHERE child_id=? ORDER BY id""",
            (child_id,),
        ).fetchall()
    finally:
        conn.close()

    buf = io.BytesIO()
    meta = []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for r in rows:
            d = dict(r)
            stored = d.pop("file_path", "") or ""
            scores = d.pop("scores_json", None)
            d["scores"] = json.loads(scores) if scores else None
            path = _resolve_media(stored) if stored else None
            if path is not None and path.exists():
                name = f"audio/{d['id']}{path.suffix}"
                z.write(path, name)
                d["audio"] = name
            else:
                d["audio"] = None  # 已过保留期 / 文件缺失 —— 如实呈现
            meta.append(d)
        z.writestr("recordings.json", json.dumps(meta, ensure_ascii=False, indent=2))
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="child-{child_id}-recordings.zip"'},
    )
