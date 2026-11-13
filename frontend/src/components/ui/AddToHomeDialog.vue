<script setup lang="ts">
/**
 * AddToHomeDialog —— 「添加到桌面」分平台指引
 *
 * 为什么不是一个通用弹窗：三个平台的步骤完全不同，给了错的步骤比不给更糟
 * （家长按 iOS 的方法去点 Android 的菜单，只会放弃）。文案严格对应
 * useAddToHome 判出的平台，微信场景还多一步「在浏览器打开」。
 *
 * 只做说明，不做动作：iOS 的安装系统不允许网页触发，任何声称"一键安装"的
 * 按钮在 iOS 上都是假的。Android 的原生安装框由调用方（MyView）先行尝试，
 * 失败才落到这里。
 */
import { computed } from "vue";
import { MoreHorizontal, Share, Smartphone } from "@lucide/vue";
import AppDialog from "./AppDialog.vue";
import type { InstallPlatform } from "../../composables/useAddToHome";

const props = defineProps<{ platform: InstallPlatform }>();
const emit = defineEmits<{ close: [] }>();

interface Step {
  /** 该步要点的是哪个界面元素（用图标示意，缺失时只显示文字） */
  icon?: "share" | "more" | "install";
  text: string;
}

const steps = computed<Step[]>(() => {
  switch (props.platform) {
    case "wechat":
      return [
        { icon: "more", text: "点右上角「…」" },
        { text: "选「在浏览器打开」" },
        { text: "到浏览器里按下面的方法添加" },
      ];
    case "ios":
      return [
        { icon: "share", text: "点底部「分享」按钮" },
        { text: "往下滑，找到「添加到主屏幕」" },
        { text: "点右上角「添加」" },
      ];
    case "android":
      return [
        { icon: "more", text: "点浏览器右上角「⋮」" },
        { text: "选「添加到主屏幕」或「安装应用」" },
        { text: "确认「添加」" },
      ];
    default:
      return [
        { icon: "install", text: "看地址栏右侧的安装图标" },
        { text: "点一下，再选「安装」" },
      ];
  }
});

const needBrowserHint = computed(
  () => props.platform === "wechat" || props.platform === "ios"
);
</script>

<template>
  <AppDialog aria-label="添加到桌面" @close="emit('close')">
    <template #default="{ close }">
      <div class="addhome">
        <h2 class="addhome__title">把「丞丞ABC」放到桌面</h2>
        <p class="addhome__sub">放好之后一点就开，不用每次翻链接。</p>

        <ol class="addhome__steps">
          <li v-for="(step, i) in steps" :key="i" class="addhome__step">
            <span class="addhome__num" aria-hidden="true">{{ i + 1 }}</span>
            <span class="addhome__text">
              <Share v-if="step.icon === 'share'" class="k-ico" />
              <MoreHorizontal v-else-if="step.icon === 'more'" class="k-ico" />
              <Smartphone v-else-if="step.icon === 'install'" class="k-ico" />
              {{ step.text }}
            </span>
          </li>
        </ol>

        <p v-if="needBrowserHint" class="addhome__tip">
          需要在 Safari 或 Chrome 里打开才行，微信里点不开这个选项。
        </p>

        <button type="button" class="k-btn addhome__ok" @click="close">知道了</button>
      </div>
    </template>
  </AppDialog>
</template>

<style scoped>
.addhome {
  display: flex;
  flex-direction: column;
  gap: var(--gap-s);
  min-width: min(78vw, 320px);
}
.addhome__title {
  margin: 0;
  font-size: var(--fs-title);
  font-weight: var(--fw-strong);
  color: var(--ink);
}
.addhome__sub {
  margin: 0;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.addhome__steps {
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
  margin: var(--gap-xs) 0 0;
  padding: 0;
  list-style: none;
}
.addhome__step {
  display: flex;
  align-items: center;
  gap: var(--gap-s);
  padding: var(--gap-xs) var(--gap-s);
  border-radius: var(--radius-s);
  background: var(--card-bg);
  box-shadow: var(--shadow-soft);
}
.addhome__num {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6em;
  height: 1.6em;
  border-radius: var(--radius-pill);
  background: var(--brand-grad);
  color: var(--on-tone);
  font-size: var(--fs-small);
  font-weight: var(--fw-strong);
  line-height: 1;
}
.addhome__text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: var(--fs-body);
  font-weight: var(--fw-mid);
  color: var(--ink);
  /* 长句在窄屏允许折行，不让步骤卡被文字撑破 */
  flex-wrap: wrap;
}
.addhome__tip {
  margin: 0;
  font-size: var(--fs-small);
  color: var(--ink-soft);
}
.addhome__ok {
  margin-top: var(--gap-xs);
  width: 100%;
}
</style>
