<script setup lang="ts">
/**
 * 贝壳货币图标。
 *
 * 说明：项目"界面一律不用 emoji、用统一矢量图标库"的铁律在这里**单点例外** ——
 * 用户实测后明确要求贝壳用 🐚（矢量贝壳在 12~20px 下像一对括号，孩子/家长都认不出）。
 * 例外范围仅限"贝壳货币"这一枚图标，其余界面图标仍走 PathIcon（见 DEVELOPMENT §13.35）。
 */
</script>

<template>
  <span class="shell-emoji" role="img" aria-label="贝壳">🐚</span>
</template>

<style scoped>
/* 继承父级字号：在徽标里跟着数字放大缩小 */
.shell-emoji {
  font-size: 1em;
  line-height: 1;
  display: inline-block;
  vertical-align: -0.08em;
}
</style>
