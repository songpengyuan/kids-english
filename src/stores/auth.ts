/**
 * 家庭账号 store（P0）：
 * - 家庭注册/登录（口令），JWT 持久化
 * - 孩子档案列表 + 当前孩子选择
 * - 未登录（GitHub Pages 纯本地模式）时一切为空，应用照常跑
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { request, setFamilyName, setToken } from "../services/api";
import type { Child } from "../types";

const CURRENT_CHILD_KEY = "kids-auth-current-child";

export interface FamilyInfo {
  familyId: number;
  familyName: string;
}

/** 从 localStorage 恢复当前孩子选择（不存在则取列表第一个） */
function restoreChildId(children: Child[]): number | null {
  const saved = Number(localStorage.getItem(CURRENT_CHILD_KEY));
  if (saved && children.some((c) => c.id === saved)) return saved;
  return children[0]?.id ?? null;
}

export const useAuthStore = defineStore("auth", () => {
  /** 是否已登录（有家庭） */
  const family = ref<FamilyInfo | null>(null);
  /** 本家庭的孩子档案（后端为权威源） */
  const children = ref<Child[]>([]);
  /** 当前使用中的孩子 id（孩子模式的数据隔离键） */
  const currentChildId = ref<number | null>(null);
  /** 是否已从后端初始化过（避免重复拉取） */
  const ready = ref(false);
  /** 家长门禁（会话级，内存态）：算术题答对解锁后进家长中心；刷新/退出复位 */
  const parentUnlocked = ref(false);

  function unlockParent(): void {
    parentUnlocked.value = true;
  }
  function lockParent(): void {
    parentUnlocked.value = false;
  }

  const currentChild = computed<Child | null>(
    () => children.value.find((c) => c.id === currentChildId.value) ?? null,
  );

  function applyLogin(fid: number, name: string, list: Child[]) {
    family.value = { familyId: fid, familyName: name };
    children.value = list;
    currentChildId.value = restoreChildId(list);
    ready.value = true;
  }

  /** 恢复持久化会话（应用启动时调用；无 token 直接返回 false） */
  async function restore(): Promise<boolean> {
    if (ready.value) return true;
    const token = localStorage.getItem("kids-auth-token");
    if (!token) return false;
    try {
      const res = await request<{ ok: boolean; family_id: number; family_name: string; children: Child[] }>(
        "/auth/me",
      );
      if (res.ok) {
        applyLogin(res.family_id, res.family_name, res.children);
        return true;
      }
    } catch {
      /* 后端不可用：保持未登录（纯本地模式） */
    }
    return false;
  }

  async function register(familyName: string, passcode: string): Promise<boolean> {
    const res = await request<{ ok: boolean; token: string; family_id: number }>(
      "/auth/register",
      { method: "POST", body: { family_name: familyName, passcode }, auth: false },
    );
    setToken(res.token);
    setFamilyName(familyName);
    family.value = { familyId: res.family_id, familyName };
    children.value = [];
    currentChildId.value = null;
    ready.value = true;
    return true;
  }

  async function login(familyName: string, passcode: string): Promise<boolean> {
    const res = await request<{
      ok: boolean;
      token: string;
      family_id: number;
      family_name: string;
      children: Child[];
    }>("/auth/login", { method: "POST", body: { family_name: familyName, passcode }, auth: false });
    setToken(res.token);
    setFamilyName(res.family_name);
    applyLogin(res.family_id, res.family_name, res.children);
    return true;
  }

  /** 刷新家庭/孩子（孩子列表变化后同步；失败静默——离线时用本地缓存） */
  async function refreshMe(): Promise<void> {
    try {
      const res = await request<{ ok: boolean; family_id: number; family_name: string; children: Child[] }>(
        "/auth/me",
      );
      if (res.ok) applyLogin(res.family_id, res.family_name, res.children);
    } catch {
      /* 离线忽略 */
    }
  }

  /** 新建孩子档案（成功后自动选中） */
  async function createChild(name: string, avatar?: string): Promise<Child> {
    const res = await request<{ ok: boolean; child: Child }>("/auth/children", {
      method: "POST",
      body: { name, avatar },
    });
    const child = res.child;
    children.value = [...children.value, child];
    currentChildId.value = child.id;
    localStorage.setItem(CURRENT_CHILD_KEY, String(child.id));
    return child;
  }

  function selectChild(id: number): void {
    if (children.value.some((c) => c.id === id)) {
      currentChildId.value = id;
      localStorage.setItem(CURRENT_CHILD_KEY, String(id));
    }
  }

  function logout(): void {
    setToken(null);
    setFamilyName(null);
    family.value = null;
    children.value = [];
    currentChildId.value = null;
    ready.value = false;
    lockParent();
  }

  return {
    family,
    children,
    currentChildId,
    currentChild,
    ready,
    parentUnlocked,
    unlockParent,
    lockParent,
    restore,
    register,
    login,
    refreshMe,
    createChild,
    selectChild,
    logout,
  };
});
