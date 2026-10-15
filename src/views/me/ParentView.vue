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
import AppHeader from "../../components/layout/AppHeader.vue";
import SoundToggle from "../../components/layout/SoundToggle.vue";
import ThemeToggle from "../../components/layout/ThemeToggle.vue";
import { ChevronRight, BarChart3, Clock, Activity, Volume2, Moon, Shield, Plus, LogOut } from "@lucide/vue";
import { speakZh } from "../../services/speech";

const progress = useProgressStore();
const rewards = useRewardsStore();
const auth = useAuthStore();
const content = useContentStore();
const router = useRouter();

const mode = ref<"login" | "register">("login");
const form = reactive({ familyName: "", passcode: "" });
const newChildName = ref("");
const busy = ref(false);
const error = ref("");

const loggedIn = computed(() => auth.family !== null);

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  return m ? `${m} 分 ${Math.round(sec % 60)} 秒` : `${Math.round(sec)} 秒`;
}

function go(path: string) { router.push(path); }

/** 登录/注册提交；成功后拉课程内容 + 同步进度（进入云模式） */
async function submit() {
  error.value = "";
  if (!form.familyName.trim() || form.passcode.length < 4) {
    error.value = "家庭名和口令都要填，口令至少 4 位";
    return;
  }
  busy.value = true;
  try {
    const ok = mode.value === "login"
      ? await auth.login(form.familyName.trim(), form.passcode)
      : await auth.register(form.familyName.trim(), form.passcode);
    if (ok) {
      content.loadFromServer();
      progress.syncFromServer();
    }
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
    <AppHeader title="家长中心" icon="me" show-back />

    <div class="body view-body">
      <!-- 家庭账号（云模式） -->
      <section class="card family-card" @click="sayFamily">
        <h3 class="f-head">
          <Shield class="k-ico" />
          <span>家庭账号</span>
          <span v-if="loggedIn" class="f-badge">云同步中</span>
        </h3>

        <!-- 未登录：注册/登录表单 -->
        <template v-if="!loggedIn">
          <div class="f-mode">
            <button :class="{ on: mode === 'login' }" @click="mode = 'login'; error = ''">登录</button>
            <button :class="{ on: mode === 'register' }" @click="mode = 'register'; error = ''">注册新家庭</button>
          </div>
          <input v-model="form.familyName" class="f-input" placeholder="家庭名（如：橙子家）" maxlength="20" />
          <input v-model="form.passcode" class="f-input" type="password" placeholder="口令（至少 4 位）" maxlength="20"
            @keyup.enter="submit" />
          <button class="f-submit" :disabled="busy" @click="submit">
            {{ busy ? "请稍候…" : mode === "login" ? "登录并同步进度" : "创建家庭" }}
          </button>
          <p class="f-tip">注册后孩子的进度会云端同步，换设备不丢；不注册也能用（仅存本机）。</p>
        </template>

        <!-- 已登录：家庭信息 + 孩子管理 -->
        <template v-else>
          <p class="f-name">👨‍👩‍👦 {{ auth.family!.familyName }}</p>
          <div class="f-children">
            <button v-for="c in auth.children" :key="c.id" class="f-child"
              :class="{ on: c.id === auth.currentChildId }" @click="pickChild(c.id)">
              <span class="fc-avatar">{{ c.avatar || "👶" }}</span>
              <span>{{ c.name }}</span>
            </button>
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

      <!-- 今日统计 -->
      <section class="stats card">
        <h3>今日学习</h3>
        <div class="stat-row">
          <Clock class="k-ico" />
          <span>时长</span>
          <b>{{ fmtDuration(progress.todayStats.durationSec) }}</b>
        </div>
        <div class="stat-row">
          <Activity class="k-ico" />
          <span>玩法次数</span>
          <b>{{ progress.todayStats.activities }} 次</b>
        </div>
        <div class="stat-row">
          <span>🐚</span>
          <span>贝壳</span>
          <b>{{ rewards.shells }}</b>
        </div>
        <div class="stat-row">
          <span>🦸</span>
          <span>英雄图鉴</span>
          <b>{{ rewards.ownedCount }}/{{ FORM_TOTAL }}</b>
        </div>
      </section>

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
      </section>

      <p class="foot">登录家庭账号后，学习记录云端同步（多设备不丢）</p>
      <p class="foot">建议每次陪学 10~15 分钟</p>
    </div>
  </div>
</template>

<style scoped>
.body { display: flex; flex-direction: column; gap: var(--gap-s); width: 100%; overflow-y: auto; padding-bottom: var(--pad-y); }
.entry { display: flex; align-items: center; gap: var(--gap-s); background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow-hard); padding: var(--gap-m); text-align: left; width: 100%; }
.entry > .k-ico { width: 24px; height: 24px; color: var(--ink-soft); }
.e-body { flex: 1; }
.e-name { font-weight: 800; }
.e-desc { font-size: 12px; color: var(--ink-faint); font-weight: 700; }
.arrow { color: var(--ink-faint); }
.card { background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow-hard); padding: var(--gap-m); }
.card h3 { margin: 0 0 var(--gap-s); font-size: var(--fs-small); color: var(--ink-soft); }
.stat-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-weight: 700; font-size: 14px; }
.stat-row > .k-ico { width: 18px; height: 18px; color: var(--ink-faint); }
.stat-row span:nth-child(2) { flex: 1; color: var(--ink-soft); }
.set-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
.set-label { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; }
.set-label .k-ico { width: 18px; height: 18px; }
.foot { text-align: center; color: var(--ink-faint); font-size: 12px; margin: 0; }

/* 家庭账号卡 */
.family-card { border-left: 4px solid var(--green); }
.f-head { display: flex; align-items: center; gap: 6px; }
.f-head .k-ico { width: 16px; height: 16px; color: var(--green); }
.f-badge { margin-left: auto; background: var(--green); color: #fff; border-radius: 999px; padding: 2px 8px; font-size: 11px; }
.f-mode { display: flex; gap: 8px; margin-bottom: var(--gap-s); }
.f-mode button { flex: 1; padding: 8px 0; border-radius: var(--radius); font-weight: 800; font-size: 14px; background: var(--line); color: var(--ink-soft); }
.f-mode button.on { background: var(--green); color: #fff; }
.f-input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: var(--radius); border: 2px solid var(--line); font-size: 15px; margin-bottom: 8px; background: var(--bg); color: var(--ink); }
.f-submit { width: 100%; padding: 12px 0; border-radius: var(--radius); background: var(--green); color: #fff; font-weight: 900; font-size: 15px; }
.f-submit:disabled { opacity: 0.6; }
.f-tip { margin: 6px 0 0; font-size: 12px; color: var(--ink-faint); }
.f-name { margin: 0 0 8px; font-weight: 900; font-size: 15px; }
.f-children { display: flex; flex-wrap: wrap; gap: 8px; }
.f-child { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 999px; background: var(--line); font-weight: 800; font-size: 14px; }
.f-child.on { background: var(--green); color: #fff; }
.fc-avatar { font-size: 16px; }
.f-add { display: flex; gap: 8px; margin-top: 8px; }
.f-add .f-input { flex: 1; margin-bottom: 0; }
.f-add-btn { display: flex; align-items: center; gap: 4px; padding: 0 14px; border-radius: var(--radius); background: var(--blue); color: #fff; font-weight: 800; font-size: 13px; }
.f-add-btn .k-ico { width: 14px; height: 14px; }
.f-out { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
.f-out-btn { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--ink-faint); font-weight: 700; }
.f-out-btn .k-ico { width: 14px; height: 14px; }
.f-error { margin: 8px 0 0; color: #dc2626; font-weight: 700; font-size: 13px; }
</style>
