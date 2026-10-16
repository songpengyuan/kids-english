"""SQLite 连接与建表（P0：单机起步，可平滑迁 PostgreSQL）。"""
import os
import sqlite3
from pathlib import Path

# 测试可用环境变量 KIDS_DB_PATH 指向临时库，避免污染真实数据
DB_PATH = Path(os.environ.get("KIDS_DB_PATH", Path(__file__).resolve().parent.parent / "kids.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS families (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  passcode_hash TEXT NOT NULL,
  passcode_salt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS children (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id),
  name TEXT NOT NULL,
  avatar TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  order_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  title_zh TEXT NOT NULL,
  emoji TEXT,
  tone TEXT,
  type TEXT,
  date TEXT,
  content_json TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS progress (
  child_id INTEGER NOT NULL REFERENCES children(id),
  lesson_id TEXT NOT NULL,          -- '__meta' = 孩子级元数据（_daily/_last/_dailyLog）
  data_json TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (child_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS rewards (
  child_id INTEGER PRIMARY KEY REFERENCES children(id),
  data_json TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL REFERENCES children(id),
  lesson_id TEXT,
  activity_type TEXT NOT NULL DEFAULT 'follow',
  ref_text TEXT,
  duration_ms INTEGER,
  file_path TEXT NOT NULL,
  scores_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_children_family ON children(family_id);
CREATE INDEX IF NOT EXISTS idx_recordings_child ON recordings(child_id, id);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _apply_migrations(conn: sqlite3.Connection) -> None:
    """存量库升级（幂等）：
    - families 补账号资料字段（email 唯一、nickname、updated_at）
    - children 补出生日期字段（birth_date，可空=存量孩子）
    """
    f_cols = {r["name"] for r in conn.execute("PRAGMA table_info(families)")}
    for col, ddl in (
        ("email", "ALTER TABLE families ADD COLUMN email TEXT"),
        ("nickname", "ALTER TABLE families ADD COLUMN nickname TEXT"),
        ("updated_at", "ALTER TABLE families ADD COLUMN updated_at TEXT"),
    ):
        if col not in f_cols:
            conn.execute(ddl)
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_families_email ON families(email)")

    c_cols = {r["name"] for r in conn.execute("PRAGMA table_info(children)")}
    if "birth_date" not in c_cols:
        conn.execute("ALTER TABLE children ADD COLUMN birth_date TEXT")


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        _apply_migrations(conn)
        conn.commit()
    finally:
        conn.close()
