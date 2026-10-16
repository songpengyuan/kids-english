/**
 * 设计系统守卫（CI 用）—— 把「规范」变成会失败的检查，而不是文档里的一句口号。
 *
 * 检查三件事：
 *
 *  ① **引用了不存在的 CSS 变量**（且没有 fallback）
 *     这类 bug 是静默的：CSS 在 computed-value 阶段判定为 invalid，
 *     整条声明被丢掉，元素就"没有那个样式"，控制台一声不吭。
 *     实际踩过的例子（2026-10 走查一次性抓出 6 处）：
 *       · var(--card)      —— tokens 里叫 --card-bg   → 姿势舞台/缩略图底色消失
 *       · var(--pink)      —— tokens 里叫 --c-pink    → 童谣幕布的条纹整条不画
 *       · var(--ink-1)     —— tokens 里叫 --ink       → 闯关横幅文字色丢
 *       · var(--fs-big)    —— tokens 里叫 --fs-hero   → 结算徽章字号丢
 *       · var(--tint)      —— 从来不存在              → 抽屉关闭钮没有底色
 *     `var(--x, fallback)` 是**故意**的可选覆盖（如 --bar-bg 的兜底），放行。
 *
 *  ② **组件里的硬编码颜色**（`#rgb` `#rrggbb`）
 *     颜色字面值只允许写在 src/styles/（tokens.css / base.css）。
 *     视图层、UI 层、玩法层（activities / rewards / game / CuteBackdrop）都必须
 *     通过 token 或 .tone-* 取色 —— 它们是"所有页面共用同一套规范"的落点。
 *
 *  ③ **.vue 里"飘"在 SFC 块外面的内容**
 *     症状：CSS 写在 `</style>` 之后。SFC 解析器对这种顶层游离文本**不报错**、
 *     直接丢弃 —— GamePath 就这样丢了 31 行 `.lv-guide` 样式，线上从未生效，
 *     而构建、类型检查、测试全都是绿的。这里用真正的 SFC 解析器量出各块范围，
 *     检查块之外还有没有非空白内容。
 *
 * 定义来源：任何文件里出现 `--name:` 都算已定义 —— 既覆盖 tokens.css / base.css，
 * 也覆盖组件里 `:style="{ '--n': … }"` 这种运行时注入的局部变量。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseSfc } from 'vue/compiler-sfc'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/** 必须零硬编码颜色的目录（相对 src/）。按批次推进，目标是最终收掉整个 src/。 */
const STRICT_DIRS = [
  'views',
  'components/ui',
  'components/layout',
  'components/activities',
  'components/rewards',
  'components/game',
]
/** 不在上面目录里的单文件（背景装饰等），同样要求零硬编码颜色 */
const STRICT_FILES = ['components/CuteBackdrop.vue']

const isStrict = (rel) =>
  STRICT_DIRS.some((d) => rel === d || rel.startsWith(d + '/')) || STRICT_FILES.includes(rel)

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(vue|css|js|ts)$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(SRC)

/**
 * 把注释替换成等长空白（**保留换行**，这样后面报的行号仍然准确）。
 * 必须做这一步：注释里经常举反例，比如 CuteBackdrop 里那句
 * "不要用 color-mix(var(--token))" —— 不剔除就会把注释当代码报错。
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/[^\n]*/gm, (m) => m.replace(/[^\n]/g, ' '))
}

/* ---------- 收集所有已定义的 CSS 变量 ---------- */
/* 匹配 "--name:"（CSS 规则里）与 "'--name':" / "\"--name\":" （JS/模板内联样式里），
 * 两种情况都归一化成同一个变量名。 */
const defined = new Set()
const DEFINE_RE = /(?:(['"])(--[a-z0-9-]+)\1|(--[a-z0-9-]+))\s*:/gi
for (const f of files) {
  const text = stripComments(readFileSync(f, 'utf8'))
  for (const m of text.matchAll(DEFINE_RE)) defined.add(m[2] ?? m[3])
}

/* ---------- ① 未定义变量 ---------- */
const USE_RE = /var\(\s*(--[a-z0-9-]+)\s*([,)])/gi
const undefinedVars = []
for (const f of files) {
  const text = stripComments(readFileSync(f, 'utf8'))
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(USE_RE)) {
      const [, name, next] = m
      if (next === ',') continue // 有 fallback：故意的可选覆盖
      if (defined.has(name)) continue
      undefinedVars.push(`${relative(SRC, f)}:${i + 1}  var(${name})`)
    }
  })
}

/* ---------- ② 组件里的硬编码颜色 ---------- */
const hardcoded = []
for (const f of files) {
  const rel = relative(SRC, f)
  if (!isStrict(rel)) continue
  const text = readFileSync(f, 'utf8')
  // 只看 <style> 块（.vue）；纯 css 全部算
  const styleBlocks = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1])
  const bodies = styleBlocks.length ? styleBlocks : [text]
  bodies.forEach((body, bi) => {
    stripComments(body)
      .split('\n')
      .forEach((line) => {
        const m = line.match(/#[0-9a-fA-F]{3,8}\b/)
        if (m) hardcoded.push(`${rel}${styleBlocks.length ? ` [style#${bi + 1}]` : ''} ${m[0]}`)
      })
  })
}

/* ---------- ③ .vue 里"飘"在 SFC 块外面的内容（典型：CSS 掉在 </style> 之后） ---------- */
const orphans = []
for (const f of files) {
  if (!f.endsWith('.vue')) continue
  const rel = relative(SRC, f)
  const source = readFileSync(f, 'utf8')
  const { descriptor, errors } = parseSfc(source, { filename: f })
  if (errors.length) {
    orphans.push(`${rel}  SFC 解析失败：${errors[0].message}`)
    continue
  }
  const blanked = source.split('')
  const blank = (from, to) => {
    for (let i = from; i < to; i++) if (blanked[i] !== '\n') blanked[i] = ' '
  }
  /* 注意：block.loc 只覆盖**块内容**，不含 `<script …>` / `</script>` 这些标签本身。
   * 所以要往外扩到标签：往前找最近的 '<'，往后找最近的 '>'。 */
  for (const b of [
    descriptor.template,
    descriptor.script,
    descriptor.scriptSetup,
    ...descriptor.styles,
    ...descriptor.customBlocks,
  ]) {
    if (!b?.loc) continue
    const open = source.lastIndexOf('<', b.loc.start.offset)
    const close = source.indexOf('>', b.loc.end.offset)
    blank(open < 0 ? b.loc.start.offset : open, close < 0 ? b.loc.end.offset : close + 1)
  }
  // 顶层 HTML 注释是合法的，一并挖空
  for (const m of source.matchAll(/<!--[\s\S]*?-->/g)) blank(m.index, m.index + m[0].length)
  const idx = blanked.join('').search(/\S/)
  if (idx >= 0) {
    const line = source.slice(0, idx).split('\n').length
    const snippet = source.slice(idx, idx + 60).split('\n')[0].trim()
    orphans.push(`${rel}:${line}  块外内容 → ${snippet}`)
  }
}

/* ---------- 汇总 ---------- */
let failed = false

if (undefinedVars.length) {
  failed = true
  console.error(`\n✋ 引用了不存在的 CSS 变量（${undefinedVars.length} 处）—— 这些声明会被静默丢弃：`)
  for (const v of undefinedVars) console.error('   ' + v)
  console.error('   请在 src/styles/tokens.css 里补上定义，或改成正确的变量名。\n')
}

if (hardcoded.length) {
  failed = true
  console.error(`\n✋ 组件里出现硬编码颜色（${hardcoded.length} 处）—— 应改用 token 或 .tone-*：`)
  for (const h of hardcoded) console.error('   ' + h)
  console.error('   颜色字面值只允许写在 src/styles/（tokens.css / base.css）。')
  console.error('   覆盖目录：' + [...STRICT_DIRS, ...STRICT_FILES].join('、') + '（详见 DESIGN_SYSTEM.md 第 13 节）\n')
}

if (orphans.length) {
  failed = true
  console.error(`\n✋ .vue 里有"飘"在 <template>/<script>/<style> 之外的代码（${orphans.length} 处）—— 会被静默丢弃：`)
  for (const o of orphans) console.error('   ' + o)
  console.error('   最常见的原因是 `</style>` 写早了，后面的 CSS 成了顶层游离文本。\n')
}

if (failed) process.exit(1)

console.log(
  `✅ 设计系统守卫通过：${files.length} 个文件，${defined.size} 个 token，` +
    `无未定义变量、无块外游离内容、${STRICT_DIRS.length + STRICT_FILES.length} 个受控路径无硬编码颜色`
)
