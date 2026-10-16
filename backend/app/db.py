"""SQLite 连接、建表与版本化迁移（P0：单机起步，可平滑迁 PostgreSQL）。"""
import os
import sqlite3
from pathlib import Path
from typing import Callable

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
  created_at TEXT DEFAULT (datetime('now')),
  -- 音频因过保留期被删除的时间（ADR-005）；行与 scores_json 保留，
  -- file_path 置空字符串表示"无音频"（原列是 NOT NULL，改约束需重建表）
  purged_at TEXT
);
-- 应用入口门禁口令：一个口令对应一个家庭（可多条）
CREATE TABLE IF NOT EXISTS gate_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  family_id INTEGER NOT NULL REFERENCES families(id),
  label TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_children_family ON children(family_id);
CREATE INDEX IF NOT EXISTS idx_recordings_child ON recordings(child_id, id);

-- 追加式事件流（ADR-004）：客户端行为与前端错误的底稿，与 progress 解耦。
-- 唯一会无限增长的表 —— 原始事件保留 180 天，之后只留 daily_stats 汇总。
-- client_event_id 由客户端生成，是幂等去重键（客户端重试不会产生重复行）。
CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_event_id TEXT NOT NULL,
  family_id       INTEGER NOT NULL REFERENCES families(id),
  child_id        INTEGER REFERENCES children(id),
  type            TEXT NOT NULL,          -- session_start / lesson_enter / activity_done
                                          -- / level_pass / listen_play / client_error
  payload_json    TEXT NOT NULL DEFAULT '{}',
  client_ts       TEXT,
  server_ts       TEXT DEFAULT (datetime('now')),
  app_version     TEXT                    -- 前端 __BUILD_ID__：错误可精确绑到某次构建
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_ceid ON events(client_event_id);
CREATE INDEX IF NOT EXISTS idx_events_child_ts ON events(child_id, server_ts);

-- 每日汇总（ADR-004）：北极星只查这张表，不扫原始事件。
CREATE TABLE IF NOT EXISTS daily_stats (
  child_id        INTEGER NOT NULL REFERENCES children(id),
  date            TEXT NOT NULL,          -- YYYY-MM-DD
  active_seconds  INTEGER NOT NULL DEFAULT 0,
  passive_seconds INTEGER NOT NULL DEFAULT 0,
  activities      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (child_id, date)
);

-- 迁移版本台账（ADR-002）：回答「这个生产库现在是什么 schema」。
-- 与代码状态解耦 —— 手工/自动部署都可能出现"代码上了、迁移没跑"的错配。
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT DEFAULT (datetime('now'))
);
"""


def connect() -> sqlite3.Connection:
    """连接 SQLite：WAL + busy_timeout + 外键，提升多设备并发读写稳定性。"""
    conn = sqlite3.connect(DB_PATH, timeout=5.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA foreign_keys=ON")
    except sqlite3.Error:
        pass  # 只读介质等场景不阻断
    return conn


# ============================================================================
# 版本化迁移（ADR-002）
# ============================================================================
# 为什么不再靠「每次启动 PRAGMA table_info 猜缺哪列」：
#   1. 无法回答「生产库现在是什么 schema」——而代码与库可能各自停在不同版本
#      （手工部署时代尤其容易「代码上了、迁移没跑」）；
#   2. 无法做数据回填（需要「只跑一次」的副作用）；
#   3. 无审计（不知道某次变更跑没跑过、何时跑的）。
#
# 约定（改这里时请守住）：
#   * MIGRATIONS **只增不改**：已上过生产的 version 不允许修改或删除，只能追加更大的 version。
#   * 每个迁移函数必须**幂等**（重复执行安全）——存量库首次运行会被「记账」为已应用。
#   * DDL 与数据回填分成两个 version，避免长事务持锁（有 busy_timeout 兜底但写入会排队）。
# ============================================================================


def _m1_families_account_fields(conn: sqlite3.Connection) -> None:
    """families 补账号资料字段：email（唯一）、nickname、updated_at。"""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(families)")}
    for col, ddl in (
        ("email", "ALTER TABLE families ADD COLUMN email TEXT"),
        ("nickname", "ALTER TABLE families ADD COLUMN nickname TEXT"),
        ("updated_at", "ALTER TABLE families ADD COLUMN updated_at TEXT"),
    ):
        if col not in cols:
            conn.execute(ddl)
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_families_email ON families(email)")


def _m2_children_birth_date(conn: sqlite3.Connection) -> None:
    """children 补出生日期（可空 = 存量孩子）。"""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(children)")}
    if "birth_date" not in cols:
        conn.execute("ALTER TABLE children ADD COLUMN birth_date TEXT")


def _m3_recordings_purged_at(conn: sqlite3.Connection) -> None:
    """recordings 补 purged_at：音频因过保留期被删除的时间。

    行与 ``scores_json`` 保留（"删音频、留分数"，见 ADR-005）——
    ``file_path`` 同时置空字符串表示"无音频"。用空串而非 NULL 是因为
    ``file_path`` 原本是 NOT NULL，改约束在 SQLite 需要重建表。
    """
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(recordings)")}
    if "purged_at" not in cols:
        conn.execute("ALTER TABLE recordings ADD COLUMN purged_at TEXT")


MIGRATIONS: list[tuple[int, str, Callable[[sqlite3.Connection], None]]] = [
    (1, "families_add_account_fields", _m1_families_account_fields),
    (2, "children_add_birth_date", _m2_children_birth_date),
    # 注意：**新增整表**（如 ADR-004 的 events/daily_stats）直接写进上面的 SCHEMA 即可 ——
    # `CREATE TABLE IF NOT EXISTS` 对已有库天然幂等，不需要迁移版本。
    # MIGRATIONS 只用于 SCHEMA 表达不了的变更：ADD COLUMN、数据回填、表重建。
    (3, "recordings_add_purged_at", _m3_recordings_purged_at),
]

def schema_version(conn: sqlite3.Connection) -> int:
    """当前库已应用的迁移版本（0 = 尚无记录）。"""
    row = conn.execute("SELECT MAX(version) AS v FROM schema_migrations").fetchone()
    return int(row["v"] or 0)


def _run_migrations(conn: sqlite3.Connection) -> None:
    """按版本顺序执行未应用的迁移；每个迁移单独一个事务。

    任何一步失败 → 抛出异常（由调用方转为「拒绝启动」），**绝不**允许半迁移状态下继续服务。
    """
    prev = conn.isolation_level
    conn.isolation_level = None  # 关闭 sqlite3 的隐式事务，改为手动 BEGIN/COMMIT 精确控制
    try:
        applied = {r["version"] for r in conn.execute("SELECT version FROM schema_migrations")}
        for version, name, run in sorted(MIGRATIONS, key=lambda m: m[0]):
            if version in applied:
                continue
            conn.execute("BEGIN")
            try:
                run(conn)
                conn.execute(
                    "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
                    (version, name),
                )
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise
    finally:
        conn.isolation_level = prev


def init_db() -> None:
    """建表 + 跑迁移。迁移失败会抛出 —— 调用方（lifespan）会让服务拒绝启动。"""
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        _run_migrations(conn)
        conn.commit()
    finally:
        conn.close()
