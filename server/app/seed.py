"""课程内容种子：从 server/seed/lessons.json 导入（幂等 upsert）。"""
import json
from pathlib import Path

from .db import connect

SEED_FILE = Path(__file__).resolve().parent.parent / "seed" / "lessons.json"


def seed_lessons(force: bool = False) -> int:
    """导入课程内容到 lessons 表；返回导入/更新数量。force=True 时全量覆盖。"""
    if not SEED_FILE.exists():
        return 0
    data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    conn = connect()
    n = 0
    try:
        for lesson in data:
            existing = conn.execute(
                "SELECT content_json FROM lessons WHERE id=?", (lesson["id"],)
            ).fetchone()
            if existing and not force:
                # 内容未变则跳过（避免刷新 updated_at 造成噪音）
                if existing["content_json"] == json.dumps(lesson, ensure_ascii=False):
                    continue
            conn.execute(
                """INSERT INTO lessons (id, order_no, title, title_zh, emoji, tone, type, date, content_json)
                   VALUES (?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET
                     order_no=excluded.order_no, title=excluded.title, title_zh=excluded.title_zh,
                     emoji=excluded.emoji, tone=excluded.tone, type=excluded.type, date=excluded.date,
                     content_json=excluded.content_json, updated_at=datetime('now')""",
                (
                    lesson["id"],
                    int(lesson.get("order", 0) or 0),
                    lesson["title"],
                    lesson["titleZh"],
                    lesson.get("emoji"),
                    lesson.get("tone"),
                    lesson.get("type"),
                    lesson.get("date"),
                    json.dumps(lesson, ensure_ascii=False),
                ),
            )
            n += 1
        conn.commit()
    finally:
        conn.close()
    return n
