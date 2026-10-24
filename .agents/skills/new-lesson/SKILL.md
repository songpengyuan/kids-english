---
name: new-lesson
description: 为 kids-english 新增或修改课时内容（接新课 l12+、补词/改词表、配发音 mp3、配词图、配歌曲视频、同步后端 seed）。凡是：老师说"新课素材来了"、要加一课/加单词/加亲子口语句、课时资源缺失（发音/词图/视频没上传）、改 lessons.json 数据、跑 export-lessons 或 validate-data——即使没说"新课"两个字也应触发。
---

# 新课接入（new-lesson）

一节课 = `src/data/lessons.json` 里一个课时对象 + `public/lessons/<id>/` 一套媒体。接入顺序：
**数据条目 → 媒体生成 → 数据校验 → seed 导出 → 测试走查 → 单链提交**。
第 2、3 步多为增量脚本，跑一遍即可；容易翻车的是素材命名和数据字段约定。

## 0. 命名与目录约定（错了就白屏）

```
frontend/public/lessons/<id>/
├── audio/<wordId>.mp3      单词发音（gen-word-audio.py 产出；缺失时 App 回退浏览器 TTS）
├── audio/ph-<序号>.mp3     亲子口语句（phrases 数组顺序决定序号）
├── words/<wordId>.webp     词图（入库后源 PNG 不留仓库，见 ADR-005 的媒体纪律）
├── song.mp3 / song.mp4     童谣音视频（视频缺失时自动显示动画舞台）
├── song.lrc                歌词时间轴（→ lyrics-pipeline skill）
└── <同名>.jpg              视频首帧 poster（optimize-videos.mjs 成对产出）
```

`lessons.json` 里的资源路径一律写 `/lessons/<id>/...`（lessons.ts normalize 时 `asset()` 自动补
BASE 前缀，别自己拼）；`words[].image` 缺失自动回退 emoji。

## 1. 数据条目（frontend/src/data/lessons.json，2212736 起数据本体 JSON 化）

- 字段：`id`(lN 递增)、`title/titleZh/emoji/tone/date`、`song{audio,video,scene,lyrics,tracks?,group?,title?}`、
  `words[{id,en,zh,emoji,image,group?,color?}]`、`phrases[{en,zh}]`；
  多词群课（如 l11 颜色/动物）加 `wordGroups[]` + 词/轨上的 `group` + 配对玩法 `colorPairs[]`。
- 关卡**不用手工接线**：pathLevels 按 lessons × 活动键自动派生（`${lessonId}-${actKey}`）。
- normalize（`lessons` 导出处）自动注入 `lessonId`、查 `song-timings.json` 得 timings、
  给 phrases/words 挂发音路径——改数据结构时这些推导要同步。
- 歌词文本约定与结构核查 → **先读 `lyrics-pipeline` skill 再定稿**（l5 乐器段写反、
  l10 多写一轮两次返工的教训都在那里）。

## 2. 媒体生成（增量脚本，按需跑）

```bash
cd frontend
python3 scripts/gen-word-audio.py            # 单词+口语句发音 mp3（edge-tts 童声，只补缺失）
python3 scripts/gen-word-art.py <...>        # 词图生成（见脚本 docstring）
python3 scripts/optimize-word-art.py         # 词图去白底 → 透明 WebP；入库后删源 PNG
node scripts/optimize-videos.mjs             # mp4 → 720p/CRF26/faststart + 首帧 poster
                                             # （94.5MB→31MB 的教训：视频是 PWA 缓存大头，别上原片）
```

歌曲与歌词时间轴 → `lyrics-pipeline` skill（合成曲 gen-songs.py / 真人演唱 gen-lrc.py）。

## 3. 数据校验（防止内容扩展把课改白屏）

```bash
cd frontend && node scripts/validate-data.mjs
```

查：课时 id 重复、单词重名、关卡引用不存在的玩法、图片/音频 404。

## 4. seed 导出（后端内容库）

```bash
cd frontend && node scripts/export-lessons.mjs
```

用 vite ssrLoadModule 直接加载 lessons.ts（读 lessons.json）导出 → `backend/seed/lessons.json`。
**这是唯一正规通道**；仅当 seed 里有他人未提交的半成品挡路时才手术式文本替换
（改完 `json.load` 校验——gen-lrc 会话曾因此把共享文件搞成非法 JSON）。

## 5. 验收与提交

- `npm run test` 全绿；UI 走查 → `ui-walkthrough` skill（新课时重点走：课程卡、
  学单词、磨耳朵列表、闯关入口四条路径）。
- 单链原子提交：素材文件与 lessons.json 数据**同一个 commit**（数据和引用它的资源
  分开提交会出现中间态白屏）。

## 隐私红线（ADR-005）

`public/` 只放内容素材；孩子录音、数据库、任何运行期数据不入库（pre-commit 会拦）。
老师素材（mp3/mp4/扫描图）入库前确认无水印问题由人类判断，agent 不要替老师做版权决定。
