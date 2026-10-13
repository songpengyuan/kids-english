# kids-english 前后端架构重构设计（2026-10）

> 状态：**草案，待确认**。三个关键决策见文末「待确认决策」，确认后进入实施。

## 1. 背景与目标

当前产品为单页 Vue3 H5，6 课内容 + 本地进度。为支撑：

- **更多课程承载**（6 课 → 几十课，加课不写代码）
- **商业化**（家长订阅制、星尘小队 IP 收集体系）
- **给其他人使用**（多家庭、多孩子、数据隔离）

需要把"纯前端静态应用"升级为"前后端分离架构"。

## 2. 现状问题

| # | 问题 | 影响 |
|---|------|------|
| 1 | 进度全在 localStorage | 换设备丢失、无法多孩子隔离、无法多用户 |
| 2 | 课程数据静态打包（lessons/pathLevels） | 加课 = 改代码发版，无法动态运营 |
| 3 | 无账号体系 | 商业化（订阅/家长端）无法落地 |
| 4 | 后端仅有评测接口 | 无数据模型、无认证、无内容 API |
| 5 | 前端无领域分层 | 课程规模扩大后代码失控 |
| 6 | 音频/资源全在静态包 | 体积膨胀、加载变慢 |

## 3. 目标架构

```
┌─ 客户端 Vue3 H5 ───────────────────────────┐
│ 壳层：路由 / AppShell / SafeBottom          │
│ 领域：learn · game · reward · me            │
│ 数据：Pinia + api client + 离线缓存         │
└──────────────┬─────────────────────────────┘
               │ HTTPS /api/v1 · JWT
┌──────────────┴─ FastAPI ───────────────────┐
│ auth      账号·孩子档案                     │
│ content   课程·关卡·题库·音频元数据         │
│ progress  学习进度同步                      │
│ evaluation 讯飞评测代理                     │
│ reward    贝壳·形态收集·解锁                │
│ subscription 订阅（后期）                   │
│ SQLite（起步）→ PostgreSQL（规模后）        │
└──────────────┬─────────────────────────────┘
               │
┌──────────────┴─────────────────────────────┐
│ 讯飞评测 · 对象存储/CDN(音频·图片) · 支付(后期)│
└────────────────────────────────────────────┘
```

## 4. 后端设计

### 4.1 目录结构

```
server/
├── app/
│   ├── main.py            # FastAPI 入口，挂载 v1 路由
│   ├── core/              # 配置(env)、安全(JWT)、依赖注入
│   ├── db.py              # SQLite 连接、表结构、迁移
│   ├── models.py          # SQLAlchemy 模型（或轻量 dataclass+SQL）
│   ├── api/
│   │   ├── auth.py        # 家长注册/登录、孩子档案 CRUD
│   │   ├── content.py     # 课程/关卡/题目列表
│   │   ├── progress.py    # 进度上报/拉取
│   │   ├── evaluation.py  # 讯飞评测代理（已存在 /api/evaluate）
│   │   └── reward.py      # 贝壳/收集/解锁同步
│   ├── services/          # 业务逻辑（评测调用、解锁规则）
│   └── schemas.py         # Pydantic 请求/响应模型
├── requirements.txt
├── .env.example
└── tests/
```

### 4.2 API 清单（/api/v1）

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| POST | /auth/login | 家庭登录（口令/家长账号） | 无 |
| GET | /auth/children | 当前家庭的孩子列表 | JWT |
| POST | /auth/children | 新建孩子档案 | JWT |
| GET | /content/lessons | 课程列表（含关卡摘要） | JWT |
| GET | /content/lessons/{id} | 课程详情（关卡/题目/音频） | JWT |
| GET | /progress/child/{id} | 孩子全量进度（拉取） | JWT |
| PUT | /progress/child/{id} | 进度上报（合并） | JWT |
| POST | /evaluation | 跟读评测（现有接口迁移 v1） | JWT |
| GET | /reward/child/{id} | 贝壳/收集/解锁状态 | JWT |
| PUT | /reward/child/{id} | 奖励状态上报 | JWT |
| POST | /subscription/… | 订阅（后期） | JWT |

### 4.3 数据模型（SQLite 初版）

| 表 | 关键字段 | 说明 |
|---|---|---|
| users | id, family_id, password_hash, email, plan | 家长账号（一家庭一主账号） |
| children | id, family_id, name, avatar, created_at | 孩子档案，一家庭多孩 |
| progress | child_id, lesson_id, level_id, quest_id, status, stars, updated_at | 学习进度（增量行） |
| rewards | child_id, item_type, item_id, stars, unlocked_at | 贝壳/形态/解锁 |
| lessons | id, title, theme_color, order, hero_id, content_json | 课程内容（可后台维护） |
| quizzes | id, lesson_id, type, payload_json, audio_url | 题目/音频元数据 |

> 内容表设计需在实施时对齐现有前端 `lessons`/`pathLevels` 数据结构（现状字段以仓库为准）。

## 5. 前端重构

### 5.1 目录结构（领域化）

```
src/
├── app/                 # 壳层：路由、App.vue、AppShell、SafeBottom
├── features/
│   ├── learn/           # 学习域（LearnStage、题型组件、SpeakText）
│   ├── game/            # 游戏域（GamePath、ChestReward、Quest）
│   ├── reward/          # 收集域（图鉴、卡片、3D）
│   └── me/              # 我的/家长端（档案、设置、订阅入口）
├── data/                # 领域数据定义（类型 + 现状静态内容，逐步后移）
├── services/            # api client、speech、audio、storage
├── stores/              # Pinia：auth、progress、content、reward
└── components/ui/       # 通用 UI 组件
```

### 5.2 数据流

- **离线优先**：本地 Pinia（localStorage 缓存）为默认读源 → 后端为权威源，增量同步
- **内容加载**：`content` store 向后端拉课程 → 缓存到本地 → 离线可用
- **进度**：本地即时写 + 防抖批量上报（合并冲突以服务端为准）
- **认证**：JWT 存 storage，401 统一拦截跳登录/家庭门禁

## 6. 分期路线

### P0（当前阶段：支撑更多课程 + 多孩子）
- [ ] 后端：SQLite + auth(家庭口令+孩子档案) + progress + content API
- [ ] 前端：api client 封装、auth store、内容改由后端拉取（保留离线缓存）
- [ ] 进度：localStorage → 后端同步（迁移存量数据）
- [ ] 课程内容迁后端（现有 6 课导入，后续加课走数据）

### P1（商业化）
- [ ] 家长账号注册/登录完善 + 订阅状态
- [ ] 家长端：使用统计、多孩子切换、门禁
- [ ] 订阅支付（后期按平台定）

### P2（规模化）
- [ ] PostgreSQL 迁移、对象存储/CDN（音频资源出静态包）
- [ ] 后台内容管理（加课/题目编排界面）
- [ ] 性能/安全加固（限流、日志、监控）

## 7. 代码规范（约定）

- 后端：FastAPI 路由按领域模块化；Pydantic 校验；凭据只走 env/.env；SQL 迁移脚本化
- 前端：features 领域内聚合组件/store/services；跨领域只经 services 层；组件 props 显式
- API：统一 /api/v1 前缀、JSON、错误结构 `{ok,error,msg}`（沿用现有评测接口风格）
- 测试：后端 pytest（评测 mock 讯飞）；前端 vitest 保持全绿基线
- 提交：`feat(server):` / `refactor(learn):` 等 conventional commits

## 8. 待确认决策（用户拍板）

| # | 决策点 | 默认建议（按上下文判断） | 备选 |
|---|--------|--------------------------|------|
| 1 | 使用范围 | 先内部后公开：P0 家庭口令简化，架构预留公开隔离 | 仅自家+亲友 / 直接公开 |
| 2 | 内容承载 | 后端内容化（加课不发版） | 前端静态（简单但要发版） |
| 3 | 客户端形态 | H5 先行，API 兼容后续小程序 | 仅 H5 |

确认或调整后，进入 P0 实施。
