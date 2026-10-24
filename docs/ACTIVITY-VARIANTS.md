# 玩法变体登记表（ACTIVITY-VARIANTS）

> **这张表回答一个问题：加一节新课，只靠数据能配出什么？**
> 加课前先查本表：目标形态都列在表里 → 纯数据可配；表里没有 → 是代码事件（见文末流程）。
> 维护约定：**任何人给玩法加变体，必须同一笔提交里更新本表**——变体只存在于组件代码里而
> 不在这里，等于下一个加课的人重新踩一遍坑（ADR-007 的配套附件，四条扩展约定见
> `lessons.ts` 类型区注释）。

## 一、课时级数据字段（影响多个玩法）

| 字段 | 效果 | 缺省行为 | validate-data 校验 |
|---|---|---|---|
| `phrases[]` | 决定玩法集合：**非空才解锁「拼句子 order」和「亲子对话 talk」**（`activityKeys`），也是这两个玩法的句子/问答来源 | 缺省 = 该课 6 个基础玩法 | 口语句引用的单词存在 |
| `wordGroups[]`（≥2 组） | 词群切换：词表按 `word.group` 归组，`learn/quiz/memory/speak/song/talk` 六个玩法只玩当前组的词（LessonView 顶部切换） | 无分组 = 平铺全词表 | 组闭包（词的 group 必须登记、每组非空、并集=全部词） |
| `song.tracks[]` + `group` | 一课多轨音视频：学童谣/磨耳朵按轨切换；`track.group` 把轨道分给对应词群 | 单轨 = 顶层 `song.audio/video/lyrics` | 轨道须有 title + audio/video 至少其一；group 须在 wordGroups 登记；文件真实存在 |
| `word.color`（十六进制） | 词卡显示**小色点**替代大图（WordCard），连一连色圆的取色来源（MatchView.hexById） | 无 color = 正常显示词图 | 色值格式 `#rgb/#rrggbb` |

## 二、玩法级变体（每玩法一行）

| 玩法 | 必需数据 | 变体（选择字段 → 行为） | 缺省行为 |
|---|---|---|---|
| song 唱童谣 | `song.audio` 或 `video` | `song.group`/`track.group` → 只放当前词群的轨；`song-timings.json` → 逐行 KTV 高亮 | 全部轨播放；无时间轴按比例映射高亮 |
| learn 学单词 | `words[]` | `stageStyle: "dialog"` → 亲子口语对话卡（逐轮问录音答，星级=首次通过率） | `cards`：多邻国式网格点读，星级=点读覆盖率 |
| quiz 听音选图 | `words[]` | —（词群过滤由课时级字段驱动） | 听音 4 选 1 图 |
| memory 翻牌记忆 | `words[]`（≥4） | — | 翻牌配对图↔词 |
| match 连一连 | `words[]` | `colorPairs[]` 传入 → **颜色配对模式**：左列色圆 ↔ 右列图（色值取颜色词的 `word.color`） | 图 ↔ 词连线；另有练习方式「认字/听力」切换（localStorage 用户偏好，非课数据） |
| speak 跟我读 | `words[]` | — | 按麦克风跟读打分 |
| order 拼句子 | `phrases[].en` | — | 把短语拆词拼回 |
| talk 亲子对话 | `phrases[]` | `wordGroups` → 按词群分段对话；问答由 `utils/talkQa` 按当前词从 phrases 推导 | 全词轮次、固定问答 |

星级口径（非变体，全局规则）：song/talk 结算封顶 1 星，其余 0-3 星；「全部通关」= 全玩法玩过且 song/talk ≥1、其余 ≥2 星（`isCompleted`）。

## 三、现有课的配置速览（哪些课在用哪些变体）

| 课 | 用到的变体 |
|---|---|
| l4 水手 / l5 音乐人 / l9 手指 | 标准配置（无变体字段） |
| l10 丛林里散步 | `stageStyle: dialog`（对话卡）+ phrases（解锁 order/talk） |
| l11 棕熊 | `wordGroups`（颜色/动物）+ `song.tracks` 分轨 + `colorPairs` 颜色配对 + 颜色词 `word.color` + phrases |

## 四、加课决策流程

```
新课素材到手
  │
  ├─ 查第二节表：目标形态 = 现有玩法 + 现有变体？
  │     └─ 是 → 纯数据：改 lessons.json（+资源文件）→ pnpm export:lessons → CI 绿 = 收工
  │           （标准新课 = 组件零改动，这是验收线）
  │
  └─ 需要新玩法 / 现有玩法的新形态？
        └─ 代码事件（三步，缺一不可）：
           ① 数据字段按 ADR-007 四约定落 lessons 类型（通用命名/可缺省/可校验/进后端契约）
           ② 组件实现变体分支（首例直写，不预造抽象；第二个使用者出现才泛化）
           ③ 本表登记一行 + validate-data 补组合校验 + 同笔提交
```

> 与 ADR-007 的关系：ADR-007 定了「能力字段怎么进 schema」；本表定「已有哪些能力」。
> 表里没有的能力就是不存在——别靠翻组件代码回忆。
