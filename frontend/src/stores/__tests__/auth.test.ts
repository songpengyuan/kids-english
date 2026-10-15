// @vitest-environment jsdom
/**
 * auth store 测试（契约对齐后端 /api/v1/auth 真实返回）：
 * 注册/登录/会话恢复/孩子创建/切换/登出。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "../auth";
import { getToken } from "../../services/api";

/** 按路由返回的 fetch mock（模仿后端 JSON 形状） */
function mockFetch(routes: Record<string, unknown>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => routes[url],
    } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

/** 401 的 fetch mock */
function mockFetch401() {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response));
}

const CHILDREN = [
  { id: 1, name: "程程", avatar: "🐰" },
  { id: 2, name: "朵朵", avatar: null },
];

describe("auth store · 契约", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("注册：存 token、建家庭、初始无孩子", async () => {
    mockFetch({
      "/api/v1/auth/register": { ok: true, token: "tok-reg", family_id: 1 },
    });
    const auth = useAuthStore();
    const ok = await auth.register("橙子家", "1234");
    expect(ok).toBe(true);
    expect(getToken()).toBe("tok-reg");
    expect(auth.family).toEqual({
      familyId: 1,
      familyName: "橙子家",
      email: null,
      nickname: "橙子家",
      createdAt: null,
    });
    expect(auth.children).toEqual([]);
    expect(auth.ready).toBe(true);
  });

  it("注册带邮箱：请求体含 email，家庭资料含邮箱", async () => {
    const { calls } = mockFetch({
      "/api/v1/auth/register": { ok: true, token: "tok-reg", family_id: 2 },
    });
    const auth = useAuthStore();
    await auth.register("邮箱家", "1234", "Parent@Example.com");
    expect(auth.family?.email).toBe("parent@example.com"); // 前端也归一化小写
    const last = calls[calls.length - 1];
    expect(JSON.parse(String(last.init!.body)).email).toBe("parent@example.com");
  });

  it("登录：邮箱识别（含 @ 走 email 通道）", async () => {
    const { calls } = mockFetch({
      "/api/v1/auth/login": {
        ok: true, token: "tok-email", family_id: 8, family_name: "邮箱家",
        email: "a@b.com", nickname: "邮箱家", children: [],
      },
    });
    const auth = useAuthStore();
    await auth.login("A@B.com", "1234");
    expect(auth.family?.email).toBe("a@b.com");
    const last = calls[calls.length - 1];
    expect(JSON.parse(String(last.init!.body)).email).toBe("a@b.com");
  });

  it("编辑资料：PATCH /auth/me 更新昵称与邮箱", async () => {
    mockFetch({
      "/api/v1/auth/me": {
        ok: true, family_id: 1, family_name: "橙子家", email: "new@b.com",
        nickname: "程程爸", created_at: "2026-10-15 00:00:00", children: [],
      },
    });
    const auth = useAuthStore();
    await auth.patchMe("程程爸", "new@b.com");
    expect(auth.family?.nickname).toBe("程程爸");
    expect(auth.family?.email).toBe("new@b.com");
    expect(auth.family?.createdAt).toBe("2026-10-15 00:00:00");
  });

  it("编辑孩子：PATCH /auth/children/{id} 更新并替换列表项", async () => {
    localStorage.setItem("kids-auth-token", "tok");
    const auth = useAuthStore();
    auth.family = { familyId: 1, familyName: "测试家", email: null, nickname: "测试家", createdAt: null };
    auth.children = [{ id: 1, name: "程程", avatar: "🐰", birthDate: "2022-03-15" }];
    auth.currentChildId = 1;
    mockFetch({
      "/api/v1/auth/children/1": {
        ok: true, child: { id: 1, name: "程程宝", avatar: "🦁", birth_date: "2022-06-01" },
      },
    });
    const child = await auth.patchChild(1, { name: "程程宝", avatar: "🦁", birthDate: "2022-06-01" });
    expect(child.name).toBe("程程宝");
    expect(auth.children[0].name).toBe("程程宝");
    expect(auth.children[0].avatar).toBe("🦁");
    expect(auth.children[0].birthDate).toBe("2022-06-01"); // snake_case → camelCase
  });

  it("登录：孩子列表入库，自动选中第一个", async () => {
    mockFetch({
      "/api/v1/auth/login": {
        ok: true, token: "tok-login", family_id: 7, family_name: "测试家",
        children: CHILDREN,
      },
    });
    const auth = useAuthStore();
    await auth.login("测试家", "1234");
    expect(auth.family?.familyId).toBe(7);
    expect(auth.children).toHaveLength(2);
    expect(auth.currentChildId).toBe(1); // 自动选第一个
    expect(auth.currentChild?.name).toBe("程程");
  });

  it("restore：有 token 时拉 /auth/me 恢复会话", async () => {
    localStorage.setItem("kids-auth-token", "tok-me");
    const { calls } = mockFetch({
      "/api/v1/auth/me": { ok: true, family_id: 3, family_name: "测试家", children: CHILDREN },
    });
    const auth = useAuthStore();
    expect(await auth.restore()).toBe(true);
    expect(calls[0].url).toBe("/api/v1/auth/me");
    expect(auth.family?.familyId).toBe(3);
    expect(auth.currentChildId).toBe(1);
  });

  it("restore：无 token → false，保持未登录", async () => {
    const auth = useAuthStore();
    expect(await auth.restore()).toBe(false);
    expect(auth.family).toBeNull();
  });

  it("restore：token 失效（401）→ 清 token 返回 false", async () => {
    localStorage.setItem("kids-auth-token", "expired");
    mockFetch401();
    const auth = useAuthStore();
    expect(await auth.restore()).toBe(false);
    expect(getToken()).toBeNull();
  });

  it("创建孩子：追加并自动选中", async () => {
    localStorage.setItem("kids-auth-token", "tok");
    const auth = useAuthStore();
    auth.family = { familyId: 1, familyName: "测试家", email: null, nickname: "测试家", createdAt: null };
    auth.children = [{ id: 1, name: "程程", avatar: null }];
    auth.currentChildId = 1;
    auth.ready = true;
    mockFetch({
      "/api/v1/auth/children": { ok: true, child: { id: 2, name: "朵朵", avatar: null } },
    });
    const child = await auth.createChild("朵朵");
    expect(child.id).toBe(2);
    expect(auth.children).toHaveLength(2);
    expect(auth.currentChildId).toBe(2); // 新建即选中
  });

  it("切换孩子：持久化选择，非法 id 忽略", () => {
    localStorage.setItem("kids-auth-token", "tok");
    const auth = useAuthStore();
    auth.family = { familyId: 1, familyName: "测试家", email: null, nickname: "测试家", createdAt: null };
    auth.children = [...CHILDREN];
    auth.currentChildId = 1;
    auth.selectChild(2);
    expect(auth.currentChildId).toBe(2);
    expect(localStorage.getItem("kids-auth-current-child")).toBe("2");
    auth.selectChild(99); // 不存在的孩子
    expect(auth.currentChildId).toBe(2);
  });

  it("登出：清 token/家庭/孩子", () => {
    localStorage.setItem("kids-auth-token", "tok");
    const auth = useAuthStore();
    auth.family = { familyId: 1, familyName: "测试家", email: null, nickname: "测试家", createdAt: null };
    auth.children = [...CHILDREN];
    auth.currentChildId = 1;
    auth.ready = true;
    auth.logout();
    expect(getToken()).toBeNull();
    expect(auth.family).toBeNull();
    expect(auth.children).toEqual([]);
    expect(auth.ready).toBe(false);
  });

  it("家长门禁：默认锁、unlock 解锁、logout 复位", () => {
    const auth = useAuthStore();
    expect(auth.parentUnlocked).toBe(false);
    auth.unlockParent();
    expect(auth.parentUnlocked).toBe(true);
    auth.logout();
    expect(auth.parentUnlocked).toBe(false);
    auth.unlockParent();
    auth.lockParent();
    expect(auth.parentUnlocked).toBe(false);
  });
});
