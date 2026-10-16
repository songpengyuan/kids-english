# 进度 / 时长 / 奖励数据定义与同步

> 本文档描述孩子学习进度、今日时长、贝壳奖励的**数据定义、更新规则与云同步机制**。
> 对应代码：`frontend/src/stores/progress.ts`、`frontend/src/stores/rewards.ts`、`frontend/src/stores/player.ts`、`backend/app/api/progress.py`、`backend/app/api/rewards.py`。

## 1. 数据总览

| 数据集 | 存储键（localStorage） | 内容 | 上云接口 |
|---|---|---|---|
| 学习进度 | `kids-english-progress-v1` | 课程星级、单词掌握度、今日时长、每日快照 | `GET/PUT /api/v1/children/{child_id}/progress` |
| 奖励 | `kids-english-rewards-v1` | 贝壳、已收集形态+星级、开箱次数 | `GET/PUT /api/v1/children/{child_id}/rewards` |

> ⚠️ 两个存储键都是**历史键名**，禁止改动——改了会读不到旧数据，孩子攒的星星/贝壳全丢。

## 2. 学习进度（progress）

### 2.1 课程级进度 `data[lessonId]`

| 字段 | 含义 | 取值范围 |
|---|---|---|
| `learn` / `quiz` / `match` / `speak` | 玩法星级 | 0–3 ★ |
| `song` / `talk` | 歌曲/对话完成标记 | 0 或 1 |
| `completed` | 已玩过的玩法列表 | 玩法 key 数组 |
| `words[wordId]` | 单词掌握度：`seen`(点读次数)、`correct`(答对)、`wrong`(答错)、`lastAt`(最近活动时间)、`stage`(记忆阶段 0–4，4=已掌握)、`dueAt`(下次复习时间) | — |

### 2.2 今日学情 `_daily`（跨天自动重置）

| 字段 | 含义 | 更新触发 |
|---|---|---|
| `date` | 本地日期 `YYYY-MM-DD` | 每天首笔活动时刷新 |
| `durationSec` | **今日学习总时长（秒）** = 玩法操作 + 看视频 + 听音频 | 见 §3.1 |
| `listenSec` | **今日磨耳朵时长（秒）** = 看视频 + 听音频（⊆ 学习总时长） | 见 §3.2 |
| `activities` | 今日完成的玩法数 | 每次学习时长结算 +1 |

### 2.3 每日快照 `_dailyLog[date]`

- 每天一条：`{ durationSec, activities, mastered(当日已掌握单词数), listenSec }`
- 保留最近 **30 天**，家长报告"掌握度趋势"的数据源
- 跨天重置只影响 `_daily`，`_dailyLog` 是历史累计

### 2.4 `_last`

- 最近进入的课时 id，首页"继续学习"入口
- 拉取时本地为空才补（本地已进入过则以本地为准）

## 3. 时长定义与更新

### 3.1 今日学习总时长（durationSec）

| 来源 | 触发方式 | 每次计入 |
|---|---|---|
| 游戏/玩法（答题、连一连、跟读等） | 关卡结算 `settleActivity()`：从进入玩法到结算的真实秒数 | 整段会话时长，`activities+1` |
| 磨耳朵页看视频/动画 | `ListenView` 结算式计时（停止/切歌时按真实秒数补入） | 秒数，同时记 `listenSec` |
| 听歌曲/音频 | `player.ts` 结算式计时（暂停/回前台/切歌时按真实秒数补入） | 秒数，同时记 `listenSec` |

- **学习总时长 = 玩法操作 + 看视频 + 听音频**（磨耳朵是其中的播放部分）
- 秒数 `Math.round` 后累加，不跨天累计（`_daily.date` 非今天则重置为 0）
- 展示口径（我的页 `fmtMin`）：`Math.round(秒/60)` → "X分钟"，满 60 分钟显示 "X小时Y分"

### 3.2 今日磨耳朵时长（listenSec）

- **定义**：看视频 + 听音频的播放时长，是学习总时长的子集（磨耳朵 ⊆ 学习）
- **结算式计时**（不是每 5s 加 5s）：
  - 音频：开始播放记 `listenStartAt`，暂停 / 切歌 / 页面回前台时 `settleListen()` 按**真实经过秒数**补入（>0.5s 才记）
  - 视频：`ListenView` 同样结算式（停止/切歌时补入尾部时长）
- 为什么：浏览器对后台标签页的 `setInterval` 会节流（Chrome 约降到 1 次/分钟），旧方案后台磨耳朵时长几乎不涨
- 每次播放结算同时累计 `_daily.listenSec` 与 `_daily.durationSec`，**不增加 `activities`**（玩法数只由玩法结算计入）

### 3.3 展示与语音播报（我的页）

- 今日学习 / 今日磨耳朵分别显示大数字卡片
- 点击播报："今天学了 X，磨耳朵 Y"（中文口语化）

## 4. 奖励（rewards）

### 4.1 贝壳（通用货币）

| 事件 | 贝壳变动 |
|---|---|
| 开宝箱 | +3 ~ +6（随机） |
| 旧贴纸迁移 | 每张折算 +20（老数据一次性，不白攒） |
| 兑换形态 | 按稀有度扣减：常见 20 / 稀有 60 / 传说 120 |

### 4.2 形态与星级（英雄图鉴）

| 字段 | 含义 |
|---|---|
| `forms[formId]` | 形态 → 星级（1–3★，3★封顶） |
| `chestsOpened` | 累计开箱次数 |
| 图鉴完成度 | 已收集数 / 总数（81 个形态） |

- **开箱掉形态**：`CHEST_FORM_CHANCE = 0`（当前**不掉**形态，只给贝壳；惊喜掉落逻辑已预留）
- **兑换/升级**：`buyForm` —— 未收集=解锁、已收集且未满星=升一星；贝壳不足/已满星不改状态
- 星级与贝壳都是**只增不减**的累积量

### 4.3 星数与学习进度的关系

- 进度页的 `learn/quiz/...` 星级（0–3）是**玩法表现**，存 progress
- 图鉴形态星级（1–3）是**贝壳消费结果**，存 rewards
- 两套独立，互不换算

## 5. 本地存储与云同步

### 5.1 写入时机

| 数据集 | 本地写入 | 云上报 |
|---|---|---|
| progress | 每次进度/时长变更立即写 localStorage | 变更后 **3s 防抖**合并上报（`scheduleReport`） |
| rewards | 每次开箱/兑换立即写 + 立即上报（`report`） | 无防抖，即时 |

### 5.2 未登录（无 token / 未选孩子）

- 纯本地模式：只写 localStorage，**不上云**
- 登录后（口令或家长账号）自动进入云模式

### 5.3 拉取合并规则（syncFromServer，防多设备互覆盖）

| 数据 | 合并规则 |
|---|---|
| 课程星级 `learn/quiz/...` | 取 **max**（只增不减） |
| `completed` | 取**并集** |
| 单词 `words` | 逐词合并：`seen/correct/wrong` 取 max，`lastAt` 取较新，SRS 阶段跟随较新活动 |
| `_daily` 今日时长 | **同日期取 max**（本地/云端较大值；跨设备不出现"今日 0 分钟"） |
| `_last` | 本地为空才补云端 |
| rewards 贝壳/星级/开箱数 | 各字段取 **max** |

### 5.4 上报与失败

- 上报失败静默标记 `cloudState=error`，下次变更自动重试
- 登录成功后先 `flushReport()`（把本地访客期数据推上云）再 `syncFromServer()`（拉云端）

## 6. REST 接口（v1，REST 规范）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/children/{child_id}/progress` | 拉取进度（data + meta） |
| PUT | `/api/v1/children/{child_id}/progress` | 全量上报（data + meta，后端按 §5.3 合并） |
| GET | `/api/v1/children/{child_id}/rewards` | 拉取奖励 |
| PUT | `/api/v1/children/{child_id}/rewards` | 上报奖励 |

- 后端合并是**权威**：`_merge_lesson`（星级 max / completed 并集 / words 逐词）、`_merge_meta`（`_daily`/`_dailyLog` 同日期取 max）
- 孩子归属校验：跨家庭访问返回 404

## 7. 埋点事件与分析口径（ADR-004）

> ⚠️ 本节定义的是**分析口径，与 §3 的展示口径不是同一个东西**。
> 两者数字不一致是**正常且预期**的：§3 的 `durationSec` 是给家长看的"今日学了多久"
> （本地即时写 + 跨设备取 max），本节是给产品复盘用的"主动学习"**代理指标**。
> 不要把两个数字拿来对齐，也不要让任一方去读另一方的存储。

### 7.1 事件流（`events` 表）

客户端行为以**追加式事件**记录，与服务端 `progress` 解耦（合并语义完全不同：
事件是高频追加、进度是低写入量合并）。

| 事件 `type` | 何时产生 | 关键 payload |
|---|---|---|
| `session_start` | App 每次冷启动 | `entry`（入口 hash）、`active`（是否主动） |
| `lesson_enter` | 进入某课 | `lesson_id` |
| `activity_done` | 完成一个玩法 / 一段播放 | `seconds`、`active`、`lesson_id` |
| `level_pass` | 通过关卡 | `lesson_id`、`level` |
| `listen_play` | 磨耳朵播放 | `seconds` |
| `client_error` | 未捕获异常 / 未处理 Promise | `kind`、`msg`、`stack`、`url` |

- 每条事件带 `client_event_id`（客户端生成）→ 服务端 `INSERT OR IGNORE` **幂等去重**；
- 每条事件带 `app_version`（= 前端 `__BUILD_ID__`）→ 线上错误可**精确绑到某一次构建**；
- 客户端**离线优先**：事件先入本地队列（`kids-telemetry-queue-v1`），能上网再批量
  `POST /api/v1/events`（失败留队下次重试）；
- 单次 ≤50 条；payload ≤1KB（超限截断）；原始事件保留 **180 天**。

### 7.2 口径定义（**先定口径，再建表**）

| 概念 | 可操作定义 |
|---|---|
| 会话 | 一次 `session_start` 开始；相邻事件间隔 > 5 分钟视为新会话 |
| **主动会话** | 会话开始**未经家长门禁入口**（`entry` 不以 `#/gate` 开头），即由孩子自己发起 |
| 被动会话 | 其余（家长进门 / 陪着操作） |
| 主动学习秒数 | 该会话内 `activity_done` 的 `payload.seconds` 之和 |
| **北极星** | 按 `(child_id, ISO 周)` 汇总主动学习秒数 ÷ 60 = **每周主动学习分钟数** |

> 「主动」无法被直接观测，所以它是一个**代理指标**（proxy），选它是因为它能排除
> "家长逼着学"的时长，符合北极星原意。不先定口径就建表的后果是可预期的 ——
> 数据收上来之后，人总会挑一个"数字好看"的算法，而方向盘不能事后校准。

### 7.3 汇总与保留

- 每日 cron 跑 `backend/scripts/rollup_events.py`：把当天事件汇总进 `daily_stats`，
  并清理超过 180 天的原始事件（**北极星只查汇总表，不扫事件表**）。
- 汇总**幂等**（先算后覆盖），可安全重跑 / 回填：`--days 7` / `--day YYYY-MM-DD`。
- 保留策略的取舍：放弃"永久明细"，换取存储与查询可控。

### 7.4 隐私边界

**不采集**：录音内容、孩子真实姓名、对话文本、精确地理位置。
错误上报的 `stack` / `msg` 截断存（800 / 300 字符），不含家长凭据。

## 8. 红线与注意事项

1. **存储键不可改**（`kids-english-progress-v1` / `kids-english-rewards-v1`）
2. **星级、贝壳、时长只增不减**：任何合并都不得让孩子的累计值变小
3. **`_daily` 取 max 而非覆盖**：多设备同一天使用时，时长取较大值
4. 时长秒数先 `Math.round` 再存，展示再 `/60` 取整，两次取整属预期
5. 磨耳朵用结算式计时，**不要改回 setInterval 每 5s 加 5s**（后台节流会丢时长）
6. **学习总时长包含播放**：`addListenActivity` 同时累计 `durationSec` 与 `listenSec`；玩法操作只走 `addDailyActivity`（累计 `durationSec` + `activities`）
