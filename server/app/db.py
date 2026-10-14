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
CREATE INDEX IF NOT EXISTS idx_children_family ON children(family_id);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()
