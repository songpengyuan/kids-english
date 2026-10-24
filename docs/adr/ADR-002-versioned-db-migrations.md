# ADR-002: 数据库迁移版本化

## Status
Accepted（2026-10-17 落地：schema_version=3 已在生产回显）

## Context

`backend/app/db.py` 的表结构演进靠一个手写的 `_apply_migrations()`：
每次启动 `PRAGMA table_info` 看缺哪列，缺就 `ALTER TABLE ADD COLUMN`。

```python
def _apply_migrations(conn):
    f_cols = {r["name"] for r in conn.execute("PRAGMA table_info(families)")}
    for col, ddl in (("email", ...), ("nickname", ...), ("updated_at", ...)):
        if col not in f_cols:
            conn.execute(ddl)
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_families_email ON families(email)")
```

这个写法在**当前阶段是合理的**：幂等、无依赖、一眼看懂，比为一个 7 表 SQLite 引 alembic 划算。
它已经成功支撑过 `families` 补三列 + `children` 补 `birth_date`。

但它有一个明确的失效边界，而且**已经很近了**：

| 能安全处理 | 无法处理 |
|---|---|
| `ADD COLUMN`（可空、无默认值语义） | 需要**回填历史数据**的迁移 |
| `CREATE INDEX IF NOT EXISTS` | 改列类型 / 重命名列（SQLite 需要重建表） |
| 新增表 | 多步迁移（先加列→回填→再加约束） |
| | 任何**需要按顺序执行**的变更 |
| | 任何需要"只跑一次"的副作用（如拆表、去重） |

两个具体后果：

1. **没有版本记录**：无法回答"生产库现在是什么 schema"。`db.py` 的代码状态 ≠ 生产库状态——
   尤其因为后端是**手工 scp 单文件**上线的（见 ADR-003），代码与库可能各自停在不同版本。
2. **无法审计与回滚**：不知道某次变更跑没跑过、跑在什么时候。

已经能预见的下一个需求就会踩到边界：ADR-004 要加 `events` 表（新增表，还行），
但商业化要加 `subscriptions`/`orders` 时几乎必然伴随**数据回填**（例如把存量家庭的 `plan` 初始化）。

## Decision

保留手写 SQL，**不引入 alembic/ORM**，只加最小可用的版本化骨架：

1. 新增一张元数据表（`SCHEMA` 里声明，`init_db()` 负责落地）：
   ```sql
   CREATE TABLE IF NOT EXISTS schema_migrations (
     version    INTEGER PRIMARY KEY,
     name       TEXT NOT NULL,
     applied_at TEXT DEFAULT (datetime('now'))
   );
   ```
2. 迁移声明为**有序列表**（模块级常量，不散落在函数里）：
   ```python
   MIGRATIONS: list[tuple[int, str, Callable[[sqlite3.Connection], None]]] = [
       (1, "families_add_account_fields", _m1),
       (2, "children_add_birth_date",     _m2),
       # (3, "events_table",             _m3),      ← ADR-004 落地时用
   ]
   ```
   现有的两次迁移**首次运行时会以 version 1/2 记账**（对已有库是 no-op，因为 `_m*` 里仍是
   幂等的 `PRAGMA` 判断；对新库则直接建到最新）。
3. 执行规则：
   - 每个迁移在**一个事务**内执行：`conn.execute("BEGIN")` → 步骤 → 写 `schema_migrations` → `COMMIT`；
   - 跳过 `version <= max(applied)` 的；
   - 任何一步失败 → **启动即失败**（复用 `assert_secret_configured()` 已有的"拒绝启动"风格），
     不允许"半迁移状态下继续服务"。
4. 迁移函数**必须幂等且只增不改**：一旦某个 version 上过生产，就只允许新增更大的 version。
5. 加一条测试：空库 `init_db()` 后 `schema_migrations` 的 `max(version)` 等于
   `MIGRATIONS[-1][0]`；对已迁移的库重复 `init_db()` 不产生新记录且不报错。

## Consequences

**变容易**
- "生产库现在是什么版本"变成一条 SQL 能回答的事实；`/api/ping` 可以顺带暴露 schema version，
  排查时不用登服务器翻代码。
- 排除了"代码上了、迁移没跑"（或反之）的静默错配——这正是手工部署时代的头号隐患。
- 迁移成为**可累积的资产**，而不是每次都要回头读懂一个越来越长的函数。

**变难 / 新债**
- 多了一层间接（人得知道"加迁移 = 往列表里追加一条"），但比重新设计更便宜。
- 事务内 `ALTER TABLE` 在 SQLite 上是支持的，但**同一迁移内混用 DDL + 大批量 DML 会长时间持锁**，
  迁移期间写入会排队（有 `busy_timeout=5000` 兜底）。约定：**DDL 与数据回填分两个 version**。
- 引入"迁移不可修改"的纪律。违规不会被工具拦住，只能靠 review——这是刻意换取的简单性。
- 长期看仍会在"需要通过重建表来改列"时感到吃力（SQLite 固有限制）。此时的正确反应是
  评估 Postgres（触发条件见 ARCHITECTURE-EVOLUTION.md §5），而不是把迁移系统做大。

## Alternatives considered

| 方案 | 取舍 | 结论 |
|---|---|---|
| **A. 维持 `_apply_migrations` 现状** | 零成本；但无版本记录、无法回填、无审计 | ❌ 边界已近（下一次数据回填就会踩） |
| **B. 版本化有序列表 + `schema_migrations` 表（本方案）** | 约 60 行；不引依赖；可累积 | ✅ **采纳** |
| **C. 引入 alembic** | 生态成熟、支持降级与 autogenerate；但为 7 表 SQLite 引入 SQLAlchemy 依赖与配置面，且 autogenerate 对 SQLite 的 ALTER 支持本就要手写 batch 操作 | ❌ 规模不匹配（何时再评估：表数 >12 或需要 ORM） |
| **D. 每次变更写一份编号 SQL 文件，启动时按文件名执行** | 迁移与代码解耦、可被 DBA 审阅；但本项目无独立 DBA，且 SQLite 的部分变更必须写 Python 逻辑（回填/重建），纯 SQL 表达不了 | ❌ 表达能力不足 |

### 与 ADR-003 的耦合

本 ADR 的价值**大部分依赖 ADR-003**：如果后端仍靠手工 scp 单文件上线，那么"迁移版本化"只是
把一个不可复现的过程记录得更清晰一点。两者应一起落地。
