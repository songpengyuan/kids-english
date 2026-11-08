<script setup lang="ts">
/**
 * 法律文档页（#/terms / #/privacy / #/children-privacy）——公开可访问。
 *
 * 一页三用（kind 由路由参数决定）：用户协议 / 隐私政策 / 儿童信息处理规则。
 * 读者是家长（注册时勾选的三个链接都指到这里），文案说人话、不堆法条。
 * 定位：个人非经营性家庭教育工具（免费内测阶段）；后续商业化时需要按
 * 实际主体/收费模式修订，届时找专业人士过一遍。
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import PageShell from "../components/ui/PageShell.vue";

const route = useRoute();
const kind = computed(() => {
  const k = route.path.replace(/^\//, "");
  return k === "privacy" || k === "children-privacy" ? k : "terms";
});

const META: Record<string, { title: string; updated: string }> = {
  terms: { title: "用户协议", updated: "2026-11-08" },
  privacy: { title: "隐私政策", updated: "2026-11-08" },
  "children-privacy": { title: "儿童个人信息处理规则", updated: "2026-11-08" },
};

const BODY: Record<string, { h: string; ps: string[] }[]> = {
  terms: [
    {
      h: "1. 这是什么产品",
      ps: [
        "「闲思杂记」是一个家庭内部使用的儿童英语启蒙工具：围绕儿歌和单词卡片，帮家长陪孩子做每天的英语互动。目前处于免费内测阶段，凭邀请口令使用。",
        "本产品由个人开发者运营，非培训机构，不提供任何形式的在线授课或教学服务。",
      ],
    },
    {
      h: "2. 使用条件",
      ps: [
        "使用本产品即表示你已阅读并同意本协议。产品的使用者为家长/监护人，儿童在家长陪同下使用。",
        "注册时请提供真实有效的信息；你的家庭名和密码用于登录，请妥善保管。",
      ],
    },
    {
      h: "3. 内容与知识产权",
      ps: [
        "应用内的儿歌音频、插画、文字内容仅供你在本产品内使用，不得下载后单独传播或商用。",
        "「闲思杂记」的界面、代码与原创内容版权归开发者所有。",
      ],
    },
    {
      h: "4. 行为规范",
      ps: [
        "不得利用本产品从事任何违法违规活动；不得尝试访问、篡改其他家庭的数据。",
        "发现安全问题时欢迎第一时间反馈（见联系方式）。",
      ],
    },
    {
      h: "5. 免责与变更",
      ps: [
        "产品按「现状」提供。它是学习辅助工具，不能替代家长的陪伴和正规教育。",
        "内测期间功能可能随时调整；重大变更会在本页更新日期中体现。",
      ],
    },
  ],
  privacy: [
    {
      h: "1. 我们收集什么",
      ps: [
        "账号信息：家庭名、密码（加密存储）。可选提供邮箱用于找回。",
        "孩子档案：昵称、卡通头像、生日——由家长手动填写，不要求真实姓名或照片。",
        "学习数据：学习时长、完成关卡、单词掌握度、错词记录。",
        "技术信息：匿名化的使用事件（如「完成了一关」）用于改进产品，不含内容详情。",
      ],
    },
    {
      h: "2. 数据存在哪里",
      ps: [
        "默认存在你自己的设备上（浏览器本地存储）——不登录账号也能完整使用。",
        "登录后，上述数据同步到我们的服务器（中国境内的华为云），仅用于跨设备恢复和多设备同步。",
      ],
    },
    {
      h: "3. 我们不做什么",
      ps: [
        "不向任何第三方出售或共享你和孩子的数据。",
        "不做广告、不上第三方统计 SDK。",
        "不主动联系孩子——产品内所有交互都面向家长账号。",
      ],
    },
    {
      h: "4. 你的权利",
      ps: [
        "随时可以：在家长中心查看/修改孩子信息；导出或删除学习数据；注销账号（联系开发者，收到请求后 7 日内删除服务器上的全部数据）。",
      ],
    },
    {
      h: "5. 联系方式",
      ps: [
        "任何隐私问题请通过小红书私信或内测群联系开发者。",
      ],
    },
  ],
  "children-privacy": [
    {
      h: "1. 本规则是什么",
      ps: [
        "依据《个人信息保护法》第 31 条与《儿童个人信息网络保护规定》制定。处理不满 14 周岁未成年人的个人信息，必须取得监护人同意——本产品由家长注册并创建孩子档案，注册即视为监护人已阅读并同意本规则。",
      ],
    },
    {
      h: "2. 我们收集哪些儿童信息",
      ps: [
        "孩子昵称（家长填写，建议不用真名）、卡通头像（内置图案，不支持上传照片）、出生日期（可选）。",
        "学习产生的数据：玩过哪些关卡、星星数量、单词掌握度、答错记录。",
        "录音功能（内测期未开放）：上线前会单独弹出说明并逐次征得家长同意，录音仅用于发音对照，保留 90 天后自动删除，可随时手动删除。",
      ],
    },
    {
      h: "3. 最小必要原则",
      ps: [
        "不收集孩子的真实姓名、照片、精确位置、通讯录、设备标识符用于广告。",
        "不让孩子在产品内与陌生人交流——没有任何聊天、评论或社区功能。",
      ],
    },
    {
      h: "4. 监护人的权利",
      ps: [
        "随时查看、更正、删除孩子的信息（家长中心操作），或注销孩子档案并删除服务器上的全部关联数据（联系开发者，7 日内完成）。",
        "如对儿童信息处理有异议，可以随时停止使用并要求删除——数据可导出后一并交付。",
      ],
    },
    {
      h: "5. 存储与安全",
      ps: [
        "数据存储于中国境内华为云服务器，传输全程 HTTPS，密码加盐哈希存储。",
        "孩子的数据与其家庭账号绑定，其他任何家庭无法访问。",
      ],
    },
  ],
};

const meta = computed(() => META[kind.value]);
const body = computed(() => BODY[kind.value]);
</script>

<template>
  <PageShell :title="meta.title" show-back back-label="返回">
    <div class="doc">
      <p class="doc__updated">更新日期：{{ meta.updated }}</p>
      <section v-for="sec in body" :key="sec.h" class="doc__sec">
        <h2>{{ sec.h }}</h2>
        <p v-for="(p, i) in sec.ps" :key="i">{{ p }}</p>
      </section>
    </div>
  </PageShell>
</template>

<style scoped>
.doc {
  max-width: 640px;
  margin: 0 auto;
  padding-bottom: 48px;
}
.doc__updated {
  color: var(--ink-faint);
  font-size: var(--fs-small);
}
.doc__sec {
  margin-top: 22px;
}
.doc__sec h2 {
  font-size: 16px;
  font-weight: var(--fw-strong);
  margin-bottom: 8px;
}
.doc__sec p {
  margin: 0 0 8px;
  color: var(--ink-soft);
  line-height: 1.85;
  font-size: 14px;
}
</style>
