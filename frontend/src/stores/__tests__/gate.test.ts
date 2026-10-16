// @vitest-environment jsdom
/**
 * 应用入口门禁 store（stores/gate.ts）单元测试。
 * 后端校验模式：verify() 调 POST /auth/gate，成功后存 JWT 并解锁。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

// Mock API 层：verify() 走 request("/auth/gate", ...)
vi.mock("../../services/api", () => ({
  request: vi.fn(),
  setToken: vi.fn(),
  setFamilyName: vi.fn(),
  setBackendOk: vi.fn(),
  isBackendOk: () => true,
}));

import { useGateStore, GATE_TTL_MS } from "../gate";
import { request } from "../../services/api";

const mockRequest = vi.mocked(request);

describe("useGateStore（应用入口门禁，后端校验）", () => {
  beforeEach(() => {
    // 模拟生产环境（非局域网）：isLocalOrigin() 返回 false，走后端校验路径
    Object.defineProperty(window, "location", {
      value: { hostname: "zelab.cn", protocol: "https:", href: "https://zelab.cn/app/" },
      configurable: true,
      writable: true,
    });
    localStorage.clear();
    mockRequest.mockReset();
    setActivePinia(createPinia());
  });

  it("初始态：门禁开启、未解锁", () => {
    const gate = useGateStore();
    expect(gate.enabled).toBe(true);
    expect(gate.isUnlocked).toBe(false);
  });

  it("后端返回成功 → 解锁", async () => {
    mockRequest.mockResolvedValueOnce({
      ok: true,
      token: "fake-jwt",
      family_id: 1,
      family_name: "gate-default",
      email: null,
      nickname: "家长",
      children: [],
    });
    const gate = useGateStore();
    expect(await gate.verify("13800138000")).toBe(true);
    expect(gate.isUnlocked).toBe(true);
    expect(mockRequest).toHaveBeenCalledWith(
      "/auth/gate",
      expect.objectContaining({ method: "POST", auth: false }),
    );
  });

  it("后端返回 401（口令错）→ 拒绝，不解锁", async () => {
    mockRequest.mockRejectedValueOnce(new Error("口令不对"));
    const gate = useGateStore();
    expect(await gate.verify("wrong")).toBe(false);
    expect(gate.isUnlocked).toBe(false);
  });

  it("后端不可用 → 拒绝（fail closed，不降级放行）", async () => {
    mockRequest.mockRejectedValueOnce(new Error("网络不可用"));
    const gate = useGateStore();
    expect(await gate.verify("13800138000")).toBe(false);
    expect(gate.isUnlocked).toBe(false);
  });

  it("setEnabled(false) 关闭门禁后直进，重新开启后需再输入", () => {
    const gate = useGateStore();
    gate.setEnabled(false);
    expect(gate.isUnlocked).toBe(true);
    gate.setEnabled(true);
    expect(gate.isUnlocked).toBe(false);
  });

  it("门禁开关持久化（刷新后仍为关闭）", () => {
    const gate = useGateStore();
    gate.setEnabled(false);
    setActivePinia(createPinia());
    expect(useGateStore().enabled).toBe(false);
  });

  it("解锁 7 天后过期，需重新输入口令", () => {
    localStorage.setItem(
      "kc-app-gate",
      JSON.stringify({ unlockedAt: Date.now() - (GATE_TTL_MS + 24 * 3600 * 1000) }),
    );
    setActivePinia(createPinia());
    expect(useGateStore().isUnlocked).toBe(false);
  });

  it("7 天内的解锁时间戳 → 仍为已解锁", () => {
    localStorage.setItem(
      "kc-app-gate",
      JSON.stringify({ unlockedAt: Date.now() - GATE_TTL_MS + 60 * 1000 }),
    );
    setActivePinia(createPinia());
    expect(useGateStore().isUnlocked).toBe(true);
  });
});
