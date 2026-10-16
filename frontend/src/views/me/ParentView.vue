<script setup lang="ts">
/**
 * 家长中心（/me/parent）——大人用的：
 *   孩子管理（云模式：多孩子切换、编辑名字/头像/生日）
 *   家长报告入口 / 声音与暗黑设置 / 应用口令门禁开关
 *
 * 设计（2026-10 统一）：骨架 PageShell、卡片用全局 .card、卡片内标题用 .card-title、
 * 报告入口用 EntryRow（原来自己写了一份 .entry，圆角和阴影都和别处不同）。
 *
 * 本次顺带做的清理：
 *   - 原 HeaderBar 只 `emit('back')`、**没有默认返回行为**，而这里当时没绑 @back
 *     —— 家长中心顶栏的返回键一直是点了没反应的（现已绑 router.back()）。
 *   - 删掉一批从未被模板调用的死代码：登录/注册表单逻辑（submit/form/mode）、
 *     账号资料编辑（startEditProfile/saveProfile/profile）、sayFamily，
 *     以及随之失去用途的 useContentStore。这些是早期"家庭账号登录页"的残留，
 *     模板里的对应 UI 早已移除，逻辑却一直留在文件里。
 *   - 删掉死样式（.stat-row / .f-mode / .f-submit / .f-tip / .f-name / .f-meta /
 *     .f-out / .f-out-btn）与未使用的图标 import。
 */
import { computed, reactive, ref } from "vue";
import { useProgressStore } from "../../stores/progress";
import { useAuthStore } from "../../stores/auth";
import { useRouter } from "vue-router";
import PageShell from "../../components/ui/PageShell.vue";
import EntryRow from "../../components/ui/EntryRow.vue";
import IconTile from "../../components/ui/IconTile.vue";
import SoundToggle from "../../components/layout/SoundToggle.vue";
import ThemeToggle from "../../components/layout/ThemeToggle.vue";
import {
  BarChart3,
  Volume2,
  Moon,
  Shield,
  Plus,
  Pencil,
  KeyRound,
} from "@lucide/vue";
import { speakZh } from "../../services/speech";
import type { Child } from "../../types";
import { useGateStore } from "../../stores/gate";

const progress = useProgressStore();
const auth = useAuthStore();
const router = useRouter();
const gate = useGateStore();

/** 应用入口门禁开关（家长中心设置区；口令固定，家长只可开/关） */
const gateMsg = ref("");

function toggleGate() {
  const next = !gate.enabled;
  gate.setEnabled(next);
  gateMsg.value = next ? "已开启应用口令门禁" : "已关闭应用口令门禁（建议保持开启）";
  speakZh(next ? "应用口令门禁已开启" : "应用口令门禁已关闭");
}

const newChildName = ref("");
const busy = ref(false);
const error = ref("");

const loggedIn = computed(() => auth.family !== null);

/** 孩子编辑：编辑中的孩子 id（null = 未编辑） */
const editingChildId = ref<number | null>(null);
const childForm = reactive({ name: "", avatar: "", birthDate: "" });

function startEditChild(c: Child) {
  editingChildId.value = c.id;
  childForm.name = c.name;
  childForm.avatar = c.avatar ?? "";
  childForm.birthDate = c.birthDate ?? "";
  error.value = "";
}

async function saveChild() {
  error.value = "";
  const name = childForm.name.trim();
  if (!name) {
    error.value = "孩子名字不能为空";
    return;
  }
  busy.value = true;
  try {
    await auth.patchChild(editingChildId.value!, {
      name,
      avatar: childForm.avatar.trim() || null,
      birthDate: childForm.birthDate.trim() || null,
    });
    editingChildId.value = null;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function addChild() {
  error.value = "";
  const name = newChildName.value.trim();
  if (!name) {
    error.value = "输入孩子名字";
    return;
  }
  busy.value = true;
  try {
    await auth.createChild(name);
    newChildName.value = "";
    await progress.syncFromServer();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function pickChild(id: number) {
  if (id === auth.currentChildId) return;
  auth.selectChild(id);
  progress.syncFromServer();
}
</script>

<template>
  <PageShell
    scroll
    title="家长中心"
    icon="me"
    show-badges
    back-label="返回"
    @back="router.back()"
  >
    <!-- 孩子管理（云模式） -->
    <section class="card family">
      <h3 class="card-title family__head">
        <Shield class="k-ico family__shield" />
        <span>孩子管理</span>
        <span v-if="loggedIn" class="family__badge">云同步中</span>
      </h3>

      <!-- 孩子列表 + 切换 -->
      <div class="kids">
        <div v-for="c in auth.children" :key="c.id" class="kid-wrap">
          <button
            class="kid"
            :class="{ 'kid--on': c.id === auth.currentChildId }"
            @click="pickChild(c.id)"
          >
            <span class="kid__avatar">{{ c.avatar || "👶" }}</span>
            <span>{{ c.name }}</span>
          </button>
          <button class="kid-edit" title="编辑名字" @click="startEditChild(c)">
            <Pencil class="k-ico" />
          </button>
        </div>
      </div>

      <!-- 孩子编辑表单（名字/头像/生日） -->
      <div v-if="editingChildId !== null" class="kid-edit-form">
        <input v-model="childForm.name" class="field" placeholder="名字" maxlength="20" />
        <input
          v-model="childForm.avatar"
          class="field"
          placeholder="头像 emoji（如 🦁）"
          maxlength="8"
        />
        <input v-model="childForm.birthDate" class="field" type="date" placeholder="出生日期" />
        <div class="actions">
          <button class="btn-primary" :disabled="busy" @click="saveChild">保存</button>
          <button class="btn-ghost" @click="editingChildId = null">取消</button>
        </div>
      </div>
      <div v-else class="kid-add">
        <input
          v-model="newChildName"
          class="field"
          placeholder="添加孩子（输入名字）"
          maxlength="20"
          @keyup.enter="addChild"
        />
        <button class="btn-primary" :disabled="busy" @click="addChild">
          <Plus class="k-ico" /> 添加
        </button>
      </div>

      <p v-if="error" class="form-error">{{ error }}</p>
    </section>

    <!-- 家长报告：全页唯一的实质行动 -->
    <EntryRow title="家长报告" desc="掌握度趋势 · 待巩固词" to="/me/report">
      <template #icon>
        <IconTile tone="blue"><BarChart3 class="k-ico" /></IconTile>
      </template>
    </EntryRow>

    <!-- 设置 -->
    <section class="card">
      <h3 class="card-title">设置</h3>

      <div class="set-row">
        <span class="set-label"><Volume2 class="k-ico" /> 声音</span>
        <SoundToggle />
      </div>
      <div class="set-row">
        <span class="set-label"><Moon class="k-ico" /> 暗黑模式</span>
        <ThemeToggle />
      </div>
      <!-- 应用入口口令门禁（备案合规；口令固定，家长只可开/关） -->
      <div class="set-row">
        <span class="set-label"><KeyRound class="k-ico" /> 应用口令门禁</span>
        <button class="gate" :class="{ 'gate--on': gate.enabled }" @click="toggleGate">
          {{ gate.enabled ? "开启中" : "已关闭" }}
        </button>
      </div>
      <p v-if="gateMsg" class="gate-msg">{{ gateMsg }}</p>
      <p class="gate-desc">进入应用前必须输入家长口令。本设备解锁后 7 天内免输。</p>
    </section>

    <p class="foot">建议每次陪学 10~15 分钟</p>
  </PageShell>
</template>

<style scoped>
/* ---------- 家庭卡 ---------- */
.family {
  border-left: 4px solid var(--brand);
}
.family__head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.family__shield {
  color: var(--brand);
}
.family__badge {
  margin-left: auto;
  background: var(--brand);
  color: var(--on-tone);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
  font-size: var(--fs-small);
}

.kids {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-s);
}
.kid-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}
.kid {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 8px 12px;
  border-radius: var(--radius-pill);
  background: var(--line);
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
  color: var(--ink);
}
.kid--on {
  background: var(--brand);
  color: var(--on-tone);
}
.kid__avatar {
  font-size: var(--fs-body);
}
/* 编辑入口是家长页的次级控件，可以小于儿童触控目标（--tap-min 是给孩子定的） */
.kid-edit {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-pill);
  background: var(--line);
  color: var(--ink-soft);
  font-size: var(--fs-small);
}

.kid-edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--gap-xs);
  margin-top: var(--gap-s);
  padding: var(--gap-s);
  border-radius: var(--radius-s);
  background: var(--bg);
}
.kid-add {
  display: flex;
  gap: var(--gap-s);
  margin-top: var(--gap-s);
}
.kid-add .field {
  flex: 1;
}

.actions {
  display: flex;
  gap: var(--gap-s);
}
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  border-radius: var(--radius-s);
  background: var(--brand);
  color: var(--on-tone);
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
}
.btn-primary:disabled {
  opacity: 0.6;
}
.btn-ghost {
  padding: 8px 16px;
  border-radius: var(--radius-s);
  background: none;
  color: var(--ink-faint);
  font-weight: var(--fw-strong);
  font-size: var(--fs-small);
}

.form-error {
  margin: var(--gap-s) 0 0;
  color: var(--red);
  font-weight: var(--fw-mid);
  font-size: var(--fs-small);
}

/* ---------- 设置 ---------- */
.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
}
.set-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: var(--fw-mid);
  font-size: var(--fs-body);
}
.gate {
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  padding: 4px 14px;
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  background: var(--card-bg);
  color: var(--ink);
}
.gate--on {
  border-color: var(--brand);
  color: var(--brand);
}
.gate-msg {
  font-size: var(--fs-small);
  color: var(--brand);
  margin: 6px 0 0;
}
.gate-desc {
  font-size: var(--fs-small);
  color: var(--ink-faint);
  margin: 8px 0 0;
  line-height: 1.5;
}

.foot {
  text-align: center;
  color: var(--ink-faint);
  font-size: var(--fs-small);
  font-weight: var(--fw-mid);
  margin: 0;
}
</style>
