# LYRICS-WORKFLOW — 歌词与逐行时间轴工作流

> 面向后续课程：一首新歌从"只有 mp3"到"App 内逐行精确高亮"的完整路径，以及这一路踩过的坑。
> 工具与数据齐备后，一节课的歌词时间轴大约 **10 分钟机器时间** + 一次人工核对。
>
> **AI agent 请优先加载项目 skill：`.agents/skills/lyrics-pipeline/SKILL.md`**（本文件的提炼版 + 环境自举脚本），
> 需要完整案例复盘时再读本文件。

## 一、全景：歌词数据的三条来源

```
lessons.json 里的 lyrics[]         ← 歌词文本的唯一数据源（唯一手写的地方；2212736 起数据本体 JSON 化，lessons.ts 只留类型与 normalize）
    │
    ├─ l6/l7/l8（自研合成曲）
    │     gen-songs.py 合成 mp3 时同步算出逐行时间轴
    │     → src/data/song-timings.json（精确，无 estimated 标记）
    │     → public/lessons/<id>/song.lrc（export_synth_lrc 导出）
    │
    └─ l4/l5/l9/l10/l11（老师提供的真人演唱 mp3）
          gen-lrc.py 语音对齐（faster-whisper 词级识别 + NW 词对齐）
          → public/lessons/<id>/<音频同名>.lrc（运行时由前端拉取）
          → song-timings.json 仅核查/修正 l4/l5（l9-l11 故意不写 JSON，见下）
```

**消费端（2026-10-25 接入）**：`composables/useLrc.ts` 按**音频 src 推导同名 .lrc**
（`.../song.mp3 → .../song.lrc`），运行时 fetch + 解析 + 缓存：

- `ListenView.vue`（磨耳朵歌词页）：LRC 拉得到 → 按 `progress × duration` 秒级精确高亮；
  拉不到/对不上 → 回退旧的按比例映射。
- `SongView.vue`（课时"音乐"tab）：transport 的 `currentTime` 直接喂给 LRC 索引，
  逐行高亮 + 当前行自动滚到窗口正中（手动滚动后 3s 不抢）；无 LRC 则不高亮。
- 映射规则：LRC 只含唱词行，界面渲染完整 lyrics（含段间空行）；
  `mapLrcToLyrics()` 做"第 k 条 LRC 行 ↔ 第 k 个非空行"的对应，
  **条数对不上或首尾文本不一致（= 改了歌词没重跑 gen-lrc.py）自动降级**，不会错高亮。

## 二、新课歌词配置步骤（老师给了 mp3 的课）

1. **歌词文本**进 `frontend/src/data/lessons.json` 对应课时的 `song.lyrics`（或多轨课的
   `tracks[n].lyrics`）。约定：
   - 一行 = 一个语义句（和孩子跟唱的节奏一致，别一行塞两句）；
   - **段间空行用 `""` 条目**（界面上渲染为间隔）；
   - 歌词必须与音频的实际演唱结构一致——先过一遍下面的「结构核查」。
2. 跑对齐：
   ```bash
   cd frontend
   HF_ENDPOINT=https://hf-mirror.com HF_HUB_DISABLE_XET=1 \
     /Users/perrysong/.workbuddy/binaries/python/envs/default/bin/python \
     scripts/gen-lrc.py l12            # 多轨课的轨："l12#Colors Song" 这种键
   ```
   产出 `public/lessons/l12/song.lrc` + 控制台逐行核查报告（对齐值 vs 估算值/插值标注）。
3. **核对报告**：`~ 插值` 行 = whisper 没听清、靠前后锚点推算的行，逐条听音频确认；
   `<<< 偏差大` 行重点听。低置信行多说明歌词文本和音频对不上（见「结构核查」）。
4. 后端 seed 同步：跑 `node frontend/scripts/export-lessons.mjs`（正规通道；他人半成品挡路时才手术式替换）。

## 三、结构核查：歌词文本必须先对齐"歌的真实结构"

时间轴错误的头号来源不是算法，是**歌词文本与音频结构不一致**。本仓库已发生过两次：

| 案例 | 现象 | 教训 |
|---|---|---|
| l5 Music Man | 歌词把 violin 段放第 2 段，音频/视频都是 trombone 第 2 | 乐器段落顺序要按音频改歌词，不能按"经典版本"想当然 |
| l10 Jungle | 歌词写了 2 轮，音频只唱 1 轮（但每段内部重复 2 遍） | 先数音频里关键词（动物名/乐器名）出现次数，再决定歌词轮次 |

**做法定式**（都做在 gen-lrc.py 的验证流程里，也可单独跑）：

1. 裸识别全曲（**绝不带 initial_prompt**，见下），打印 SEG 段落级文本；
2. 对重复性歌词（儿歌几乎全是），把标志性词（动物/乐器/颜色名）的出现时间列成表——
   每个标志性词出现几次、在几秒，就是歌的真实结构；
3. 歌词行数/轮次与结构对不上 → 先改歌词（lessons.json），再跑对齐；
4. 拿不准的歌词文本用**切片 + 双提示词置信度仲裁**：对疑似两句之间切 2~3s 音频，
   分别以两个候选句做 initial_prompt 跑识别，平均词置信度高者为真（l5 "down your way
   vs far away" 三段全胜 far away，据此改词）。

## 四、gen-lrc.py 的对齐经验（改动前必读）

对齐质量靠这几条不变式撑着，动它们之前先跑 l5 回归看报告：

- **主识别绝不带 initial_prompt**：整曲喂歌词提示会让 whisper「对答案」——把副歌拼成
  单字母碎片（'p','a','n','o'）甚至跳过真实唱词。提示词只用于**结构化兜底阶段**（已弃用）。
- **whisper 对童声+伴奏识别是非确定的**：同参数两次运行词数能差 50+。对策是跑最多
  3 遍取「锚上歌词词数」最多的一遍（`score >= 0.85×词数` 提前停）。
- **NW 代价不变式**：完全不匹配的代价（4.0）必须 > GAP_L+GAP_A（3.2），否则 DP 会把
  歌词词硬凑到拟声杂音上，一行摊出几十秒；回溯平局时优先跳过多余音频词（歌词行锚
  重复段落的**最早**一次出现）。
- **nw_pairs 只收 token 列表**：传 `(token,start,end)` 元组会让全部词对代价退化成常数
  （历史上最大的坑，表现为所有行等距分布）。
- 副歌「串烧回调」（l5 每段副歌后带前面乐器的回调）会让歌词行错锚到回调块——兜底靠
  「相同文本/相同词数已锚定行对的节距迁移 + 上一行结束时间」，不要试图用识别解决。

**运行环境**（一次性，不在仓库里）：faster-whisper 1.2.1 装在
`~/.workbuddy/binaries/python/envs/default`（清华镜像装包）；`av` 锁 <19；
模型下载走 `HF_ENDPOINT=https://hf-mirror.com` + `HF_HUB_DISABLE_XET=1`（xet 后端过镜像 401）。
mp3 解码用 macOS 自带 `afconvert`，无 ffmpeg 依赖。

## 五、song-timings.json 的角色与约束

- 前端唯一消费点是 `SongStage` 的 **bpm**（舞台节拍动画）+ `lessons.ts` 从 lessons.json normalize 后转成
  `song.timings`；逐行高亮**不读它**（读 LRC）。
- 所以：**真人演唱课（l9-l11）不要往 JSON 里加条目**——没有可靠 bpm，乱加会改变
  SongStage 动画行为。它们的逐行时间只在 LRC 里。
- l4/l5 的条目历史上是「估算值」（`estimated: true`），已由对齐值替换；**改了这两课
  的歌词后**重跑 `gen-lrc.py l4`（或 l5）会同步更新 JSON（低置信行保留原值并维持
  estimated 标记），随后**手工同步 backend/seed/lessons.json** 的 timings 块
  （外科手术式替换，seed 是并行会话共享文件，别整文件重 dump）。

## 六、验收清单（新歌上线前）

- [ ] `gen-lrc.py <id>` 报告：低置信（插值）行为 0 或逐条人工听过；
- [ ] LRC 第一行时间 = 人声起点（前奏不留白高亮），最后一行时间 ≤ 音频时长；
- [ ] 前端两处高亮各验一首：磨耳朵歌词页（含拖动进度条）、课时"音乐"tab（含切轨道）；
- [ ] 歌词与 seed 一致；`mapLrcToLyrics` 没有触发降级（改词后必须重跑 gen-lrc.py）；
- [ ] `npm run test` 全绿。
