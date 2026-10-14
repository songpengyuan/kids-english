"""内容：课程列表/详情（/api/v1/content）。"""
import json

from fastapi import APIRouter, Depends, HTTPException

from ..db import connect
from .auth import _require_family

router = APIRouter(prefix="/api/v1/content", tags=["content"])


@router.get("/lessons")
def list_lessons(family_id: int = Depends(_require_family)):
    """课程列表（概要，不带歌词/单词全文；详情走 /lessons/{id}）。"""
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT id, order_no, title, title_zh, emoji, tone, type, date FROM lessons ORDER BY order_no"
        ).fetchall()
        return {"ok": True, "lessons": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/lessons/{lesson_id}")
def get_lesson(lesson_id: str, family_id: int = Depends(_require_family)):
    conn = connect()
    try:
        row = conn.execute(
            "SELECT content_json FROM lessons WHERE id=?", (lesson_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "课程不存在")
        return {"ok": True, "lesson": json.loads(row["content_json"])}
    finally:
        conn.close()
