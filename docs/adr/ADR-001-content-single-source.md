# ADR-001: 课程内容的单一事实源与防漂移闸门

## Status
Accepted（2026-10-17 落地：deploy.yml + ci-local.sh 均有种子漂移闸门）

## Context

课程内容目前存在于**三个位置**：

| 位置 | 角色 | 是否入库 |
|---|---|---|
| `frontend/src/data/lessons.ts`（27KB） | **唯一人工书写源** | ✅ git |
| `backend/seed/lessons.json`（29KB） | 由 `frontend/scripts/export-lessons.mjs` **生成** | ✅ git |
| `lessons` 表的 `content_json` 列 | 后端启动时 `seed_lessons()` 从上面那份导入 | ❌ 生产数据 |

生成方向是单向且明确的（TS → JSON → DB），这一点设计得对。**问题在于没有任何机制保证第一步已经执行过。**

`frontend/scripts/validate-data.mjs` 只校验 TS 那一份（结构/引用/去重/音频资源存在）；
CI 的 `build:ci` 只跑 `guard-build + validate-data + vite build`；
`.github/workflows/deploy.yml` 里校验了 `openapi.json` 的漂移，**但没有校验 `backend/seed/lessons.json`**。

### 为什么这是"现在就在流血"而不是"以后再说"

因为 `frontend/src/stores/content.ts` 的合并策略是**远端优先**：

```ts
const merged = new Map(localLessons.map((l) => [l.id, l]))
for (const [id, lesson] of Object.entries(detailCache.value)) {
  merged.set(id, lesson)          // ← 远端覆盖本地
}
```

`lessonList` 同理（远端 `summaries` 有值就直接用）。

于是失败链条是：

1. 改 `lessons.ts`（改文案/加单词/调顺序）；
2. 忘记跑 `export-lessons.mjs`；
3. `git push` → 前端携新内容上线，后端仍是旧种子；
4. 孩子打开 App → 拉到旧内容 → **旧内容覆盖掉刚发布的新内容**。

表现是"我明明改了、也部署了，线上就是不变"——而且本地开发环境（后端没起）**完全复现不出来**。
这与 DEVELOPMENT.md §14.7 记的 heroDetails 教训是同一类问题，只是从"字段级"升到了"课程级"。

补充事实：当前 7 课的 TS 源与种子**是一致的**（`l4…l10`），所以现在没有实际损坏，属于"闸门缺失"而非"已出事"。

## Decision

保留构建期单一源（TS 手写），**并把漂移检测加进 CI**，复用仓库里已有的机制。

1. `frontend/package.json` 增加显式脚本（目前导出只能靠人肉记住脚本名）：
   ```json
   "export:lessons": "node scripts/export-lessons.mjs"
   ```
2. `.github/workflows/deploy.yml` 在 `be-gate` 之后加一步，与 `openapi.json` 的契约校验**完全同构**：
   ```yaml
   - name: Content seed drift check
     run: |
       cd frontend
       pnpm export:lessons
       cd ..
       git diff --exit-code -- backend/seed/lessons.json
   ```
3. 同步补进 `scripts/ci-local.sh`（本地门禁第 4 步旁边），让它在 push 前就拦下，而不是等 CI 红。
4. `DEVELOPMENT.md` §14.5 的"质量三件套"补一条：**改 `src/data/lessons.ts` 后必须重跑导出**。

## Consequences

**变容易**
- 漂移从"线上玄学"变成"推之前就红"，且报错信息直接指向 `backend/seed/lessons.json`。
- 与 `openapi.json` 共用同一套模式（生成物入库 + CI `git diff --exit-code`）。**一个模式，两处使用**，
  新成员只需理解一次。这比发明第二套机制便宜得多。
- 保住"离线首开"：内容仍随包发布，后端不可用时 App 完整可用（GitHub Pages 部署也不受影响）。

**变难 / 新债**
- 每次改课程内容会连带一个生成文件的 diff（噪声）。可接受：`openapi.json` 已经在承担同样的成本，
  且生成文件 diff 可读（它就是可读 JSON）。
- **本决策不解决"加课要发版"**。产品目标（ROADMAP P2「新增一课 <1 天」、`archive/ARCHITECTURE-2026.md` §3 内容动态运营）
  需要的是**运行期由后端决定内容**，那是另一个决策（见 ARCHITECTURE-EVOLUTION.md 待拍板 D1）。
  本 ADR 只保证"在还没有运营后台之前，双源不要互相骗"。
- 诚实地说：在出现运营后台之前，`backend/seed/lessons.json` 这份副本的**收益接近 0**（没有后台可用它，
  加课照样要发版），成本是上面那条漂移风险。保留它是**对 P2 的提前下注**——本 ADR 的作用就是
  在等 P2 的这段时间里，把这笔下注的副作用按住。

## Alternatives considered

| 方案 | 取舍 | 结论 |
|---|---|---|
| **A. 维持现状** | 零成本，但把一致性寄托在人的记忆力上 | ❌ 已证明不可靠（heroDetails 先例） |
| **B. 生成物入库 + CI 防漂移闸门** | 30 分钟；一个生成文件 diff 的噪声 | ✅ **采纳** |
| **C. 前端不再打包内容，运行期只从后端取** | 真正实现"加课不发版"；但①后端挂/离线时首开无内容，②GitHub Pages 那份部署彻底不可用，③丢掉了"安装即可用" | ⏸ 与 D1 一起决策，不在本 ADR 范围内 |
| **D. 删掉后端内容副本，纯前端静态** | 彻底消灭双源；但放弃 P2 的内容管线方向，等于砍掉产品路线 | ⏸ 若确定不做运营后台，这是最简答案 |
| **E. 运行时自动同步（启动时对比 TS 与 JSON）** | 后端镜像里没有 TS 源码，做不到 | ❌ 不可行 |

> 若最终选 C 或 D，本 ADR 应被标记为 `Superseded`，而不是被"悄悄删掉"。
