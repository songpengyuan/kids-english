/**
 * 家庭账号 store：
 * - 注册/登录（家庭名 或 邮箱 + 口令），JWT 持久化
 * - 家长资料：邮箱（全局唯一，可空）、昵称、注册时间；PATCH 编辑
 * - 孩子档案列表 + 当前孩子选择
 * - 未登录（纯本地模式）时一切为空，应用照常跑
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { request, setFamilyName, setToken } from "../services/api";
import type { components } from "../types/api";
import type { Child } from "../types";

type RegisterOut = components["schemas"]["RegisterOut"];
type LoginOut = components["schemas"]["LoginOut"];
type MeOut = components["schemas"]["MeOut"];
type ChildCreatedOut = components["schemas"]["ChildCreatedOut"];

const CURRENT_CHILD_KEY = "kids-auth-current-child";

/** 后端 ChildOut（snake_case）→ 前端 Child（camelCase） */
function toChild(c: components["schemas"]["ChildOut"]): Child {
  return { id: c.id, name: c.name, avatar: c.avatar ?? null, birthDate: c.birth_date ?? null };
}

export interface FamilyInfo {
  familyId: number;
  familyName: string;
  /** 家长邮箱（可空=纯家庭名账号；全局唯一） */
  email: string | null;
  /** 家长昵称（默认=家庭名） */
  nickname: string;
  /** 注册时间（me 接口提供；login 响应无此字段时为 null，restore 后补全） */
  createdAt: string | null;
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

  function applyLogin(
    fid: number,
    name: string,
    list: components["schemas"]["ChildOut"][],
    extra?: { email?: string | null; nickname?: string; createdAt?: string | null },
  ) {
    family.value = {
      familyId: fid,
      familyName: name,
      email: extra?.email ?? null,
      nickname: extra?.nickname ?? name,
      createdAt: extra?.createdAt ?? null,
    };
    children.value = list.map(toChild);
    currentChildId.value = restoreChildId(children.value);
    ready.value = true;
  }

  /** 恢复持久化会话（应用启动时调用；无 token 直接返回 false） */
  async function restore(): Promise<boolean> {
    if (ready.value) return true;
    const token = localStorage.getItem("kids-auth-token");
    if (!token) return false;
    try {
      const res = await request<MeOut>("/auth/me");
      if (res.ok) {
        applyLogin(res.family_id, res.family_name, res.children, {
          email: res.email ?? null,
          nickname: res.nickname,
          createdAt: res.created_at,
        });
        return true;
      }
    } catch {
      /* 后端不可用：保持未登录（纯本地模式） */
    }
    return false;
  }

  async function register(familyName: string, passcode: string, email?: string): Promise<boolean> {
    const body: { family_name: string; passcode: string; email?: string } = {
      family_name: familyName,
      passcode,
    };
    if (email && email.trim()) body.email = email.trim().toLowerCase();
    const res = await request<RegisterOut>(
      "/auth/register",
      { method: "POST", body, auth: false },
    );
    setToken(res.token);
    setFamilyName(familyName);
    applyLogin(res.family_id, familyName, [], { nickname: familyName, email: body.email ?? null });
    return true;
  }

  /**
   * 登录：identifier 是「家庭名 或 邮箱」——含 @ 视为邮箱（新通道），否则按家庭名（存量通道）。
   */
  async function login(identifier: string, passcode: string): Promise<boolean> {
    const body = identifier.includes("@")
      ? { email: identifier.trim().toLowerCase(), passcode }
      : { family_name: identifier.trim(), passcode };
    const res = await request<LoginOut>("/auth/login", { method: "POST", body, auth: false });
    setToken(res.token);
    setFamilyName(res.family_name);
    applyLogin(res.family_id, res.family_name, res.children, {
      email: res.email ?? null,
      nickname: res.nickname,
    });
    return true;
  }

  /** 编辑家长资料（昵称 / 邮箱，空串表示不修改该项） */
  async function patchMe(nickname: string, email: string): Promise<boolean> {
    const res = await request<MeOut>("/auth/me", {
      method: "PATCH",
      body: { nickname: nickname.trim() || undefined, email: email.trim() || undefined },
    });
    if (res.ok) {
      applyLogin(res.family_id, res.family_name, res.children, {
        email: res.email ?? null,
        nickname: res.nickname,
        createdAt: res.created_at,
      });
      return true;
    }
    return false;
  }

  /** 刷新家庭/孩子（孩子列表变化后同步；失败静默——离线时用本地缓存） */
  async function refreshMe(): Promise<void> {
    try {
      const res = await request<MeOut>("/auth/me");
      if (res.ok) {
        applyLogin(res.family_id, res.family_name, res.children, {
          email: res.email ?? null,
          nickname: res.nickname,
          createdAt: res.created_at,
        });
      }
    } catch {
      /* 离线忽略 */
    }
  }

  /** 新建孩子档案（成功后自动选中） */
  async function createChild(name: string, avatar?: string, birthDate?: string): Promise<Child> {
    const res = await request<ChildCreatedOut>("/auth/children", {
      method: "POST",
      body: { name, avatar, birth_date: birthDate || null },
    });
    const child = toChild(res.child);
    children.value = [...children.value, child];
    currentChildId.value = child.id;
    localStorage.setItem(CURRENT_CHILD_KEY, String(child.id));
    return child;
  }

  /** 编辑孩子档案：名/头像/生日（缺席字段不改；null 清空） */
  async function patchChild(
    childId: number,
    patch: { name?: string; avatar?: string | null; birthDate?: string | null },
  ): Promise<Child> {
    const body: { name?: string; avatar?: string | null; birth_date?: string | null } = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.avatar !== undefined) body.avatar = patch.avatar;
    if (patch.birthDate !== undefined) body.birth_date = patch.birthDate;
    const res = await request<ChildCreatedOut>(`/auth/children/${childId}`, { method: "PATCH", body });
    const child = toChild(res.child);
    children.value = children.value.map((c) => (c.id === childId ? child : c));
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
    patchMe,
    refreshMe,
    createChild,
    patchChild,
    selectChild,
    logout,
  };
});
