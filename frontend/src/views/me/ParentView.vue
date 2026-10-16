<script setup lang="ts">
/**
 * 家长中心（/me/parent）——大人用的：
 *   家庭账号（云模式：注册/登录、孩子管理、多设备同步）
 *   家长报告 / 今日统计 / 声音与暗黑设置 / 数据说明
 */
import { computed, reactive, ref } from "vue";
import { useProgressStore } from "../../stores/progress";
import { useRewardsStore } from "../../stores/rewards";
import { FORM_TOTAL } from "../../data/heroes";
import { useRouter } from "vue-router";
import { useAuthStore } from "../../stores/auth";
import { useContentStore } from "../../stores/content";
import HeaderBar from "../../components/layout/HeaderBar.vue";
import PathIcon from "../../components/PathIcon.vue";
import SoundToggle from "../../components/layout/SoundToggle.vue";
import ThemeToggle from "../../components/layout/ThemeToggle.vue";
import { ChevronRight, BarChart3, Clock, Activity, Volume2, Moon, Shield, Plus, LogOut, Pencil, KeyRound } from "@lucide/vue";
import { speakZh } from "../../services/speech";
import type { Child } from "../../types";
import { useGateStore } from "../../stores/gate";

const progress = useProgressStore();
const rewards = useRewardsStore();
const auth = useAuthStore();
const content = useContentStore();
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

const mode = ref<"login" | "register">("login");
const form = reactive({ familyName: "", passcode: "", email: "" });
const newChildName = ref("");
const busy = ref(false);
const error = ref("");
/** 资料编辑态：false=展示，true=编辑中 */
const editingProfile = ref(false);
const profile = reactive({ nickname: "", email: "" });

const loggedIn = computed(() => auth.family !== null);

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  return m ? `${m} 分 ${Math.round(sec % 60)} 秒` : `${Math.round(sec)} 秒`;
}

function go(path: string) { router.push(path); }

/** 登录/注册提交；成功后拉课程内容 + 同步进度（进入云模式） */
async function submit() {
  error.value = "";
  const phone = form.familyName.trim();
  if (!/^1\d{10}$/.test(phone)) {
    error.value = "请输入 11 位手机号";
    return;
  }
  if (form.passcode.length < 4) {
    error.value = "口令至少 4 位";
    return;
  }
  busy.value = true;
  try {
    // 手机号即账号：先尝试登录，不存在则自动注册
    let ok = await auth.login(phone, form.passcode);
    if (!ok && mode.value === "register") {
      ok = await auth.register(phone, form.passcode);
    }
    if (ok) {
      content.loadFromServer();
      progress.syncFromServer();
      rewards.syncFromServer();
    }
  } catch (e) {
    // 登录失败且未注册 → 自动注册
    if (mode.value === "register") {
      try {
        await auth.register(phone, form.passcode);
        content.loadFromServer();
        progress.syncFromServer();
        rewards.syncFromServer();
      } catch (e2) {
        error.value = (e2 as Error).message;
      }
    } else {
      error.value = (e as Error).message;
    }
  } finally {
    busy.value = false;
  }
}

/** 进入资料编辑：用当前账号资料初始化输入框 */
function startEditProfile() {
  profile.nickname = auth.family!.nickname;
  profile.email = auth.family!.email ?? "";
  editingProfile.value = true;
}

/** 保存资料编辑 */
async function saveProfile() {
  error.value = "";
  busy.value = true;
  try {
    await auth.patchMe(profile.nickname, profile.email);
    editingProfile.value = false;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

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
  if (!name) { error.value = "输入孩子名字"; return; }
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

function logout() {
  auth.logout();
  form.passcode = "";
}

function sayFamily() {
  const name = loggedIn.value ? auth.family!.familyName : "还没有家庭账号";
  speakZh(`家庭账号：${name}`);
}
</script>

<template>
  <div class="parent view">
    <HeaderBar show-back show-badges>
      <template #title><PathIcon name="me" class="hdr-ico" /> 家长中心</template>
    </HeaderBar>

    <div class="body view-body">
      <!-- 家庭账号（云模式） -->
      <section class="card family-card" @click="sayFamily">
        <h3 class="f-head">
          <Shield class="k-ico" />
          <span>家庭账号</span>
          <span v-if="loggedIn" class="f-badge">云同步中</span>
        </h3>

        <!-- 未登录：手机号 + 口令登录 -->
        <template v-if="!loggedIn">
          <div class="f-mode">
            <button :class="{ on: mode === 'login' }" @click="mode = 'login'; error = ''">登录</button>
            <button :class="{ on: mode === 'register' }" @click="mode = 'register'; error = ''">注册</button>
          </div>
          <input v-model="form.familyName" class="f-input" type="tel"
            placeholder="手机号（11 位）" maxlength="11" inputmode="numeric" />
          <input v-model="form.passcode" class="f-input" type="password" placeholder="口令" maxlength="20"
            @keyup.enter="submit" />
          <button class="f-submit" :disabled="busy" @click="submit">
            {{ busy ? "请稍候…" : "登录并同步进度" }}
          </button>
          <p class="f-tip">手机号即账号；第一次输入自动注册。不登录也能用（仅存本机）。</p>
        </template>

        <!-- 已登录：家庭信息 + 孩子管理 -->
        <template v-else>
          <p class="f-name">👨‍👩‍👦 {{ auth.family!.nickname }}</p>
          <p class="f-meta">{{ auth.family!.email ?? "未绑定邮箱" }}<span v-if="auth.family!.createdAt"> · 注册于 {{ auth.family!.createdAt.slice(0, 10) }}</span></p>

          <!-- 资料编辑（昵称 / 邮箱） -->
          <template v-if="editingProfile">
            <input v-model="profile.nickname" class="f-input" placeholder="家长昵称" maxlength="20" />
            <input v-model="profile.email" class="f-input" type="email" placeholder="家长邮箱（选填）" maxlength="50" />
            <div class="f-profile-actions">
              <button class="f-add-btn" :disabled="busy" @click="saveProfile">保存</button>
              <button class="f-ghost-btn" @click="editingProfile = false">取消</button>
            </div>
          </template>
          <button v-else class="f-ghost-btn" @click="startEditProfile">✏️ 编辑资料</button>

          <div class="f-children">
            <div v-for="c in auth.children" :key="c.id" class="f-child-wrap">
              <button class="f-child" :class="{ on: c.id === auth.currentChildId }" @click="pickChild(c.id)">
                <span class="fc-avatar">{{ c.avatar || "👶" }}</span>
                <span>{{ c.name }}</span>
              </button>
              <button class="f-edit-btn" title="编辑资料" @click="startEditChild(c)">
                <Pencil class="k-ico" />
              </button>
            </div>
          </div>

          <!-- 孩子编辑表单（名字/头像/生日） -->
          <div v-if="editingChildId !== null" class="f-child-edit">
            <input v-model="childForm.name" class="f-input" placeholder="名字" maxlength="20" />
            <input v-model="childForm.avatar" class="f-input" placeholder="头像 emoji（如 🦁）" maxlength="8" />
            <input v-model="childForm.birthDate" class="f-input" type="date" placeholder="出生日期" />
            <div class="f-profile-actions">
              <button class="f-add-btn" :disabled="busy" @click="saveChild">保存</button>
              <button class="f-ghost-btn" @click="editingChildId = null">取消</button>
            </div>
          </div>
          <div class="f-add">
            <input v-model="newChildName" class="f-input" placeholder="添加孩子（输入名字）" maxlength="20"
              @keyup.enter="addChild" />
            <button class="f-add-btn" :disabled="busy" @click="addChild"><Plus class="k-ico" /> 添加</button>
          </div>
          <div class="f-out">
            <button class="f-out-btn" @click="logout"><LogOut class="k-ico" /> 退出登录</button>
            <span class="f-tip">切换孩子后各自进度独立保存</span>
          </div>
        </template>

        <p v-if="error" class="f-error">{{ error }}</p>
      </section>

      <!-- 家长报告 -->
      <button class="entry" @click="go('/me/report')">
        <BarChart3 class="k-ico" />
        <div class="e-body">
          <div class="e-name">家长报告</div>
          <div class="e-desc">掌握度趋势 · 待巩固词</div>
        </div>
        <ChevronRight class="k-ico arrow" />
      </button>

      <!-- 设置 -->
      <section class="settings card">
        <h3>设置</h3>
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
          <button class="gate-mini" :class="{ on: gate.enabled }" @click="toggleGate">
            {{ gate.enabled ? "开启中" : "已关闭" }}
          </button>
        </div>
        <p v-if="gateMsg" class="gate-msg">{{ gateMsg }}</p>
        <p class="gate-desc">进入应用前必须输入家长口令。本设备解锁后 7 天内免输。</p>
      </section>

      <p class="foot">建议每次陪学 10~15 分钟</p>
    </div>
  </div>
</template>

<style scoped>
.body { display: flex; flex-direction: column; gap: var(--gap-s); width: 100%; overflow-y: auto; padding-bottom: var(--pad-y); }
.entry { display: flex; align-items: center; gap: 12px; background: var(--card-bg); border-radius: 18px; box-shadow: var(--shadow-soft); padding: 14px 16px; text-align: left; width: 100%; }
.entry > .k-ico { width: 24px; height: 24px; color: var(--ink-soft); }
.e-body { flex: 1; }
.e-name { font-weight: 800; }
.e-desc { font-size: 12px; color: var(--ink-faint); font-weight: 700; }
.arrow { color: var(--ink-faint); }
.card { background: var(--card-bg); border-radius: 18px; box-shadow: var(--shadow-soft); padding: 16px; }
.card h3 { margin: 0 0 var(--gap-s); font-size: var(--fs-small); color: var(--ink-soft); }
.stat-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-weight: 700; font-size: 14px; }
.stat-row > .k-ico { width: 18px; height: 18px; color: var(--ink-faint); }
.stat-row span:nth-child(2) { flex: 1; color: var(--ink-soft); }
.set-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
.set-label { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; }
.set-label .k-ico { width: 18px; height: 18px; }
.gate-mini {
  border: 1px solid var(--line, #e5e2db);
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 13px;
  font-weight: 700;
  background: var(--card-bg);
  color: var(--ink);
  cursor: pointer;
  margin-left: 8px;
}
.gate-mini.on {
  border-color: var(--brand, #00a3ff);
  color: var(--brand, #00a3ff);
}
.gate-msg { font-size: 12px; color: var(--brand); margin: 6px 0 0; }
.gate-desc { font-size: 12px; color: var(--ink-faint); margin: 8px 0 0; line-height: 1.5; }
.foot { text-align: center; color: var(--ink-faint); font-size: 12px; margin: 0; }

/* 家庭账号卡 */
.family-card { border-left: 4px solid var(--brand); }
.f-head { display: flex; align-items: center; gap: 6px; }
.f-head .k-ico { width: 16px; height: 16px; color: var(--brand); }
.f-badge { margin-left: auto; background: var(--brand); color: #fff; border-radius: 999px; padding: 2px 8px; font-size: 11px; }
.f-mode { display: flex; gap: 8px; margin-bottom: var(--gap-s); }
.f-mode button { flex: 1; padding: 8px 0; border-radius: var(--radius); font-weight: 800; font-size: 14px; background: var(--line); color: var(--ink-soft); }
.f-mode button.on { background: var(--brand); color: #fff; }
.f-input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: var(--radius); border: 2px solid var(--line); font-size: 15px; margin-bottom: 8px; background: var(--bg); color: var(--ink); }
.f-submit { width: 100%; padding: 12px 0; border-radius: var(--radius); background: var(--brand); color: #fff; font-weight: 900; font-size: 15px; }
.f-submit:disabled { opacity: 0.6; }
.f-tip { margin: 6px 0 0; font-size: 12px; color: var(--ink-faint); }
.f-name { margin: 0 0 2px; font-weight: 900; font-size: 15px; }
.f-meta { margin: 0 0 8px; font-size: 12px; color: var(--ink-faint); }
.f-ghost-btn { display: inline-block; margin-bottom: 8px; font-size: 13px; color: var(--blue); font-weight: 800; background: none; border: none; cursor: pointer; }
.f-profile-actions { display: flex; gap: 8px; margin-bottom: 8px; }
.f-profile-actions .f-add-btn { padding: 8px 18px; }
.f-profile-actions .f-ghost-btn { margin-bottom: 0; color: var(--ink-faint); }
.f-children { display: flex; flex-wrap: wrap; gap: 8px; }
.f-child-wrap { display: flex; align-items: center; gap: 6px; }
.f-child { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 999px; background: var(--line); font-weight: 800; font-size: 14px; }
.f-child.on { background: var(--brand); color: #fff; }
.fc-avatar { font-size: 16px; }
.f-edit-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 999px; background: var(--line); color: var(--ink-faint); }
.f-edit-btn .k-ico { width: 14px; height: 14px; }
.f-child-edit { margin-top: 8px; padding: 10px; border-radius: var(--radius); background: var(--bg); }
.f-child-edit .f-input { margin-bottom: 6px; }
.f-add { display: flex; gap: 8px; margin-top: 8px; }
.f-add .f-input { flex: 1; margin-bottom: 0; }
.f-add-btn { display: flex; align-items: center; gap: 4px; padding: 0 14px; border-radius: var(--radius); background: var(--blue); color: #fff; font-weight: 800; font-size: 13px; }
.f-add-btn .k-ico { width: 14px; height: 14px; }
.f-out { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
.f-out-btn { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--ink-faint); font-weight: 700; }
.f-out-btn .k-ico { width: 14px; height: 14px; }
.f-error { margin: 8px 0 0; color: #dc2626; font-weight: 700; font-size: 13px; }
</style>
