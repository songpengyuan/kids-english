# ADR-007: 课时能力字段采用「扁平可缺省 + 校验闸门」，不做嵌套 features 重排

## Status
Accepted（2026-10-24 随第四次架构复核落地；推翻的是同日评审建议稿中的「features 嵌套分层」方案）

## Context

2026-10-24 架构复核指出：l11 给 `RawLesson` 顶层贡献了 `wordGroups` / `song.tracks` /
`colorPairs` / `word.group` / `word.color` 等可选字段，注释里全是「l11 用」——按此速率，
30 课时会出现十几种互相纠缠的可选组合，P2「加课 <1 天」没有稳定的落库结构可依托。
评审建议把变体收进嵌套 `features` 对象（如 `features.match.mode` / `features.song.tracks`）。

实施前核查发现三个事实，改变了成本/收益判断：

1. **组合一致性校验大部分已存在**：`validate-data.mjs` 已校验词群闭包
   （word/song/track 的 `group` 须在 `wordGroups` 登记）、`colorPairs.wordId` 引用存在；
2. **这些字段已在生产 wire 格式上**：`backend/app/schemas.py` 有 `SongTrackOut` /
   `WordGroupOut` / `ColorPairOut`，前端 `types/api.ts` 是其生成物，content store 逐字段映射；
3. 消费方（LessonView / MatchView / SongView / player store）都按扁平字段取值。

嵌套重排意味着 FE 类型 + 种子导出 + BE Pydantic 模型 + OpenAPI 契约 + 全部消费方
**同步破坏性改动**；而它要修复的「schema 熵」当天的实际形态是：
注释措辞（「l11 用」）+ 两处校验洞 + 一处真正的双源 bug（见 Decision）。

## Decision

保持扁平字段，把「扩展纪律」固化为四条（同步写在 `lessons.ts` 类型区注释）：

1. 按能力命名（「词群」「颜色配对」），不按课命名——注释里的 l11 只是首例，不是定义；
2. 可缺省 + 缺省回退：老课数据一个字不改也必须照常可玩；
3. 组合一致性必须能被 `validate-data.mjs` 校验（引用存在 / 闭包 / 枚举）；
4. 同步进后端契约：`schemas.py` 的 LessonOut 族 + `pnpm export:lessons` 重导种子。

同轮补齐真正的缺口：

- **MatchView 删除组件本地 `COLOR_HEX` 色表**，色圆改从课时数据（`word.color`）取值。
  双源已实际漂移：white（#f5f5f5 vs #FFFFFF）、brown（#8d6e63 vs #8B4513）两处不一致；
  数据新增颜色（orange/pink）而本地表未登记时，色圆静默回退 #ccc；
- `validate-data.mjs` 新增校验：`stageStyle` 枚举、`word.color` 色值格式、
  `colorPairs.color` 须指向带色值的本课颜色词、`wordId` 不得重复配对、至少 2 对成局、
  歌曲轨道 title + audio/video 至少其一、第一轨与多轨的音视频文件逐个查盘
  （替换旧版「按约定查 song.mp3」——l11 第一轨是 brown-bear.mp3，按约定查会查错文件）。
- **配套登记表**（2026-10-25 补）：[`../ACTIVITY-VARIANTS.md`](../ACTIVITY-VARIANTS.md)
  ——「已有哪些能力/变体」的活文档。ADR 定字段怎么进 schema，登记表定哪些能力已存在；
  加变体必须同笔提交更新登记表。

## Consequences

**变容易**
- 加第 N 个能力字段不动 wire 格式，FE/BE/种子三方零协调成本；
- 新颜色词不再依赖组件字典登记；
- 「改了数据忘了交叉登记」在 `build:ci` 就红，不用等线上色圆变灰。

**变难 / 新债**
- 顶层可选字段会继续增多。**重开条件**：课时能力字段超过约 6 个，或出现第 2 个
  「只有一课用、且语义无法泛化」的字段时，重开嵌套分层决策——届时应连同 D1
  （内容运行期后端唯一）一起决策，而不是单独动 schema。

实测（2026-10-24）：全量门禁绿（387 前端测试 + 生产构建 + 白屏冒烟），
现有 8 课数据零改动通过全部新校验。

## Alternatives considered

| 方案 | 取舍 | 结论 |
|---|---|---|
| **A. 嵌套 features 对象重排** | 归类/观感收益；破坏生产契约，FE+BE+种子+消费方全链同步改动 | ❌ 本 ADR 推翻的对象 |
| **B. 维持扁平 + 校验闸门（本方案）** | 零 wire 变动；顶层字段缓慢增多（有重开条件兜底） | ✅ **采纳** |
| **C. 运行期后端唯一（前端不打包内容）** | 解决「加课不发版」；与字段组织方式正交 | ⏸ 归 ARCHITECTURE-EVOLUTION D1 决策 |
| **D. 维持原状不加校验** | 零成本；但色圆静默 #ccc 这类漂移已实际发生 | ❌ 已证明不够 |
