# ADR-004: 埋点事件表与前端错误上报

## Status
Accepted（2026-10-17 落地：events 表 + client_error 上报；时间戳/学习日两处口径失真已修，课时级埋点覆盖持续补）

## Context

这是"系统看不见自己"的两半问题。

### 一半：北极星指标没有数据路径

ROADMAP 定义了唯一北极星：**每周主动学习分钟数**（"孩子自己打开学的时长，不是家长逼的"），
并写明"当前无自动统计：先由家长在家长中心按周手动记录，P1 内补上自动埋点"。
`P1-BACKLOG.md` 的 P3-1/P3-2 是这件事的待办。

现状可用的数据只有 `progress` 表的 `data_json`：里面确实有 `_daily.durationSec`（今日学习秒数）
和 `_dailyLog[date]`（保留 30 天的每日快照）。技术上能算出"每天学了多久"。

但**算不出北极星的核心语义**："主动"（孩子自己打开）与"被动"（家长陪着/代开）在现有数据里
完全不可区分——现有数据只有"时长"，没有"会话"和"发起者"。反复聚合也只能得到"总时长"。

而且 `_dailyLog` 只有 30 天、存在每个孩子的一个 JSON blob 里、且合并规则是"同日期取 max"
（见 PROGRESS-DATA.md §5.3）——它被设计成**防多设备覆盖的展示口径**，不是分析数据源。
让分析逻辑去读它，会把"展示口径"和"分析口径"耦合成一件事，两者后续必然互相绑架。

### 另一半：线上故障对开发者不可见

`frontend/src/utils/errors.js` 已经捕获 `window.error` / `unhandledrejection`，
写入 localStorage 环形缓冲（最近 20 条），并提供 `window.__kidsErrors()` 自检。
代码注释里已经写明了下一步：

> 未来接入后端时，只需把 push 里的 localStorage 落盘换成 fetch(...)，调用方（main.js）不用改。

也就是说**接口留好了，缺的只是目的地**。

为什么这件事在本项目优先级高：这个产品已经发生过**两次线上白屏**（一次是 2026-10-16 的
路由自跳死循环，见 DEVELOPMENT.md）。白屏 = 环形缓冲里的记录也存在孩子的手机上，
而开发者拿不到。发现路径是"家长口述"，定位路径是"翻代码猜"。

## Decision

### 1. 先定义可计算口径，再建表（顺序不可颠倒）

"主动学习"无法被直接观测，必须选一个**代理指标**。在写任何采集代码之前，
把它写进 `docs/PROGRESS-DATA.md` 并明确它是代理指标。建议定义（**需产品确认**）：

| 概念 | 可操作定义 |
|---|---|
| 会话 | 一次 `app_open` 开始；相邻事件间隔 > 5 分钟则切分为新会话 |
| 主动会话 | 会话开始时**未经过家长门禁/家长中心**，且首个交互来自孩子侧页面（学习/磨耳朵/图鉴） |
| 主动学习秒数 | 该会话内累计的学习时长，复用现有 `durationSec` 口径（玩法 + 视频 + 音频） |
| **北极星** | 按 (child_id, ISO 周) 汇总主动学习秒数 ÷ 60 |

> 不先定口径就建表的后果是可预期的：事件收上来之后，人总会挑一个"数字好看"的算法。
> 这个指标是项目的方向盘，方向盘不能事后校准。

### 2. 追加式事件表（新表，不动 `progress`）

```sql
CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_event_id TEXT NOT NULL,              -- 客户端生成，幂等去重键
  family_id       INTEGER NOT NULL REFERENCES families(id),
  child_id        INTEGER REFERENCES children(id),
  type            TEXT NOT NULL,              -- session_start / lesson_enter / activity_done
                                              -- / level_pass / listen_play / client_error
  payload_json    TEXT NOT NULL DEFAULT '{}',
  client_ts       TEXT,
  server_ts       TEXT DEFAULT (datetime('now')),
  app_version     TEXT                         -- 前端 BUILD_ID，见下
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_ceid ON events(client_event_id);
CREATE INDEX IF NOT EXISTS idx_events_child_ts ON events(child_id, server_ts);
```

- `POST /api/v1/events`：**批量**接收（≤50 条/次），按 `client_event_id` 幂等；
  走 `children` 归属校验的同款模式（跨家庭 = 404）。
- **`app_version` 用现成的 `__BUILD_ID__`**：`vite.config.js` 已经把 `Date.now().toString(36)`
  注入到 `sw.js` 用于 PWA 更新检测。把它同时注入应用代码，**前端错误就能精确绑到某一次构建**——
  这正好补上"白屏了但不知道是哪个版本"的缺口。
- 独立表而非塞进 `progress`：写入路径互不影响（事件是高频追加，进度是低写入量合并），
  且 `progress` 的"只增不减"合并语义绝不能污染事件流。
- 汇总：每日 cron 把事件算进 `daily_stats(child_id, date, active_seconds, activities)`，
  北极星只查汇总表，不扫原始事件。

### 2.1 时间口径：时间戳格式与「学习日」（落地时补的决策）

落地过程中发现两处会让指标**静默失真**的问题，现固化为约定（实现在
`backend/app/timeutil.py`，测试在 `backend/tests/test_timeutil.py`）：

**a) 两个时间戳列格式不同，文本不可比较。**
`server_ts` 是 SQLite `datetime('now')` → `2026-10-17 06:31:09`（空格分隔）；
前端 `client_ts` 是 `new Date().toISOString()` → `2026-10-17T06:31:09.123Z`（带 `T`/`Z`）。
SQLite 里 `'2026-10-17T06:00:00.000Z' < '2026-10-17 23:00:00'` 是 **false**（`'T'` > `' '`）——
直接比字符串会算错。所以：写入时把 `client_ts` **归一**成与 `server_ts` 相同的 UTC 格式；
查询一律先过 `datetime()` 归一。

**b) 「天」是用户感知的那一天（`KIDS_TZ`，默认 `Asia/Shanghai`），不是 UTC 日。**
生产服务器 TZ 恰好是 `Asia/Shanghai`，`date.today()` 看起来"对"——但那是**巧合**：
库里存 UTC，两者只在服务器 TZ=UTC 时才自洽。按 UTC 分桶时，CST 00:00–08:00 与
21:00–24:00（上学前 / 睡前，正是真实使用高峰）会被算到相邻日。
故 `day` 参数一律是本地日，内部换算成 UTC 半开区间 `[start, end)` 再查。

**降级原则**：`client_ts` 解析失败 → 存 `NULL`，由 `COALESCE` 退回 `server_ts`，
**绝不因此拒收事件**（埋点是观测手段，不能反过来把业务请求搞挂）；
`KIDS_TZ` 非法/缺 tzdata → **启动即失败**，不静默退回 UTC（那正是要防的坑）。

> 修复窗口很关键：改动时 `events` / `daily_stats` 都是 0 行，所以**无需回填**，
> 口径修正零迁移成本。若在已有数据后才发现，就得连带重算历史汇总。

### 3. 前端错误上报（把 `errors.js` 的目的地补上）

- 保留 localStorage 环形缓冲作为**离线队列**（它现在的职责），在其上增加批量 flush：
  App 回前台 / 会话结束时上报，失败留队下次重试（与 `progress` 的"失败静默重试"同款策略）。
- 事件类型 `client_error`，payload 含 `msg` / `stack`（已截断）/ `kind` / `url` / `app_version`。
- 明确**不采集**：录音内容、孩子姓名、对话文本、精确地理位置。

### 4. 保留与隐私边界

- 原始事件保留 **180 天**，之后只留 `daily_stats` 汇总。
- payload 单条上限 1KB，超限截断并计数；事件接口单独限流（避免成为写入放大器）。
- 事件表同样是"孩子相关数据"，必须纳入备份与删除流程（见 ADR-005）。

## Consequences

**变容易**
- 北极星从"家长手记"变成可自动计算，ROADMAP 的复盘模板（§五）第一次能填上真实数字。
- 线上白屏从"家长口述"变成"事件里有 stack + 构建版本"，定位从猜变成查。
- 事件流与进度流解耦：将来要换成实时分析、或临时加字段，都不必碰孩子进度那条红线。

**变难 / 新债**
- 多了一条**写入路径**，且是客户端可伪造的：必须限流 + 尺寸上限 + 归属校验，
  且北极星只在家长中心展示给自己的数据（不构成"可被刷的对外指标"）。
- 客户端的时长本来就是近似（`Math.round` + 跨设备取 max），事件只是给它一个可审计的底稿，
  **不要**把事件算出的数字与 `progress` 展示的数字做精确对齐——两者口径不同是正常的，
  这种"两个数字不一样"会反复引起疑问，需在 PROGRESS-DATA.md 里写明。
- 表会持续增长（这是唯一无限增长的表）。180 天 + 每日汇总是有意的取舍：
  放弃"永久明细"，换取存储与查询可控。
- **延迟成本**：如果先建表后定口径，会收集一堆无法回答原问题的数据。所以第 1 条是前置条件。

## Alternatives considered

| 方案 | 取舍 | 结论 |
|---|---|---|
| **A. 不做埋点，继续家长手记** | 零成本；但北极星不可验证，ROADMAP 的"数据驱动"（P4）永远起不来 | ❌ 北极星没有数据等于没有北极星 |
| **B. 自建事件表 + 每日汇总（本方案）** | 数据留在自己服务器；需自建限流/保留/汇总 | ✅ **采纳** |
| **C. 接第三方分析 SDK（GA/Firebase 等）** | 开箱即用、有现成漏斗；但把**儿童使用数据**交给第三方、与离线优先场景不匹配、保留策略不可控（合规上更难交代） | ❌ 与"家长信任"这条支柱直接冲突 |
| **D. 直接从 `progress.data_json` 反推指标** | 零新增采集 | ❌ 无会话/发起者语义，无法区分主动与被动；且会把分析口径焊死在展示口径上 |
| **E. 只在服务端记 access log 做分析** | 零前端改动 | ❌ 后端只见 API 调用，见不到"孩子在哪个页面停留/点了什么"，测不出学习行为 |

### 与 ROADMAP 的对应

本 ADR 落地即完成 `P1-BACKLOG.md` 的 P3-1（事件定义）与 P3-2（埋点服务）；
P3-3（家长中心周视图）在其之上，属产品实现，不在本 ADR 范围。
